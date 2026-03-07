#include "AuthHandler.h"
#include <nlohmann/json.hpp>
#include <sqlite3.h>
#include <openssl/sha.h>
#include <openssl/hmac.h>
#include <sstream>
#include <iomanip>
#include <stdexcept>

using json = nlohmann::json;

namespace budgie {

// ---------------------------------------------------------------------------
// Minimal HS256 JWT helpers (sign / verify)
// Production code should use a well-tested JWT library instead.
// ---------------------------------------------------------------------------
namespace {

// Base64url-encode a byte array.
std::string base64UrlEncode(const unsigned char* data, size_t len) {
    static const char* tbl =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    out.reserve(((len + 2) / 3) * 4);
    for (size_t i = 0; i < len; i += 3) {
        unsigned int val = static_cast<unsigned int>(data[i]) << 16;
        if (i + 1 < len) val |= static_cast<unsigned int>(data[i + 1]) << 8;
        if (i + 2 < len) val |= static_cast<unsigned int>(data[i + 2]);
        out += tbl[(val >> 18) & 0x3F];
        out += tbl[(val >> 12) & 0x3F];
        out += (i + 1 < len) ? tbl[(val >> 6) & 0x3F] : '=';
        out += (i + 2 < len) ? tbl[val & 0x3F] : '=';
    }
    // Convert to base64url
    for (char& c : out) {
        if (c == '+') c = '-';
        else if (c == '/') c = '_';
    }
    // Remove padding
    while (!out.empty() && out.back() == '=') out.pop_back();
    return out;
}

std::string base64UrlEncodeStr(const std::string& s) {
    return base64UrlEncode(
        reinterpret_cast<const unsigned char*>(s.data()), s.size());
}

std::string hmacSha256(const std::string& key, const std::string& data) {
    unsigned char digest[EVP_MAX_MD_SIZE];
    unsigned int digestLen = 0;
    HMAC(EVP_sha256(),
         key.data(), static_cast<int>(key.size()),
         reinterpret_cast<const unsigned char*>(data.data()),
         static_cast<int>(data.size()),
         digest, &digestLen);
    return base64UrlEncode(digest, digestLen);
}

std::string createJwt(long long userId, const std::string& secret) {
    std::string header = base64UrlEncodeStr(R"({"alg":"HS256","typ":"JWT"})");
    json payloadJson = {{"sub", std::to_string(userId)}, {"iat", std::time(nullptr)}};
    std::string payload = base64UrlEncodeStr(payloadJson.dump());
    std::string signingInput = header + "." + payload;
    std::string sig = hmacSha256(secret, signingInput);
    return signingInput + "." + sig;
}

// Returns the user_id from the JWT, or -1 on failure.
long long verifyJwt(const std::string& token, const std::string& secret) {
    auto dot1 = token.find('.');
    auto dot2 = token.find('.', dot1 + 1);
    if (dot1 == std::string::npos || dot2 == std::string::npos) return -1;
    std::string signingInput = token.substr(0, dot2);
    std::string expectedSig = hmacSha256(secret, signingInput);
    std::string actualSig   = token.substr(dot2 + 1);
    if (expectedSig != actualSig) return -1;
    // Base64url-decode the payload (simple approach for ASCII JSON)
    std::string payloadB64 = token.substr(dot1 + 1, dot2 - dot1 - 1);
    // Restore padding
    while (payloadB64.size() % 4 != 0) payloadB64 += '=';
    for (char& c : payloadB64) {
        if (c == '-') c = '+';
        else if (c == '_') c = '/';
    }
    // Decode (base64 → string)
    std::vector<unsigned char> decoded;
    unsigned int val = 0, bits = 0;
    for (char c : payloadB64) {
        int v;
        if (c >= 'A' && c <= 'Z')      v = c - 'A';
        else if (c >= 'a' && c <= 'z') v = c - 'a' + 26;
        else if (c >= '0' && c <= '9') v = c - '0' + 52;
        else if (c == '+')             v = 62;
        else if (c == '/')             v = 63;
        else if (c == '=')             break;
        else return -1;
        val = (val << 6) | static_cast<unsigned int>(v);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            decoded.push_back(static_cast<unsigned char>((val >> bits) & 0xFF));
        }
    }
    std::string payloadStr(decoded.begin(), decoded.end());
    try {
        json p = json::parse(payloadStr);
        return std::stoll(p.at("sub").get<std::string>());
    } catch (...) {
        return -1;
    }
}

// WARNING: SHA-256 is NOT suitable for production password storage because it
// is too fast and vulnerable to brute-force and rainbow-table attacks.
// Replace this function with a proper password-hashing algorithm such as
// bcrypt (e.g. libbcrypt), scrypt, or Argon2 before deploying to production.
// Those algorithms are intentionally slow and include a built-in random salt.
std::string hashPassword(const std::string& password) {
    unsigned char digest[SHA256_DIGEST_LENGTH];
    SHA256(reinterpret_cast<const unsigned char*>(password.data()),
           password.size(), digest);
    std::ostringstream oss;
    for (int i = 0; i < SHA256_DIGEST_LENGTH; ++i)
        oss << std::hex << std::setw(2) << std::setfill('0')
            << static_cast<int>(digest[i]);
    return oss.str();
}

void sendJson(httplib::Response& res, int status, const json& body) {
    res.status = status;
    res.set_content(body.dump(), "application/json");
}

} // anonymous namespace

// ---------------------------------------------------------------------------

long long validateToken(const std::string& authHeader,
                        const std::string& jwtSecret) {
    const std::string prefix = "Bearer ";
    if (authHeader.substr(0, prefix.size()) != prefix) return -1;
    return verifyJwt(authHeader.substr(prefix.size()), jwtSecret);
}

void registerAuthRoutes(httplib::Server& svr, Database& db,
                        const std::string& jwtSecret) {
    // --- POST /api/auth/register ---
    svr.Post("/api/auth/register", [&db, &jwtSecret](
                 const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            std::string username = body.at("username").get<std::string>();
            std::string password = body.at("password").get<std::string>();
            // Use username as email placeholder if no email supplied.
            std::string email    = body.value("email", username + "@budgie.local");

            if (username.empty() || password.size() < 6) {
                sendJson(res, 400,
                    {{"error", "username required and password must be >= 6 chars"}});
                return;
            }

            std::string pwHash = hashPassword(password);

            // Insert user
            sqlite3_stmt* stmt = nullptr;
            const char* sql =
                "INSERT INTO users (username, email, password_hash) "
                "VALUES (?, ?, ?);";
            if (sqlite3_prepare_v2(db.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
                sendJson(res, 500, {{"error", "DB prepare failed"}});
                return;
            }
            sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, email.c_str(),    -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 3, pwHash.c_str(),   -1, SQLITE_TRANSIENT);
            int rc = sqlite3_step(stmt);
            sqlite3_finalize(stmt);

            if (rc == SQLITE_CONSTRAINT) {
                sendJson(res, 409, {{"error", "Username already taken"}});
                return;
            }
            if (rc != SQLITE_DONE) {
                sendJson(res, 500, {{"error", "DB insert failed"}});
                return;
            }

            long long userId = db.lastInsertRowId();
            std::string token = createJwt(userId, jwtSecret);
            sendJson(res, 201, {
                {"token", token},
                {"user", {{"id", userId}, {"username", username}, {"email", email}}}
            });
        } catch (const json::exception& e) {
            sendJson(res, 400, {{"error", e.what()}});
        }
    });

    // --- POST /api/auth/login ---
    svr.Post("/api/auth/login", [&db, &jwtSecret](
                 const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            std::string username = body.at("username").get<std::string>();
            std::string password = body.at("password").get<std::string>();
            std::string pwHash   = hashPassword(password);

            sqlite3_stmt* stmt = nullptr;
            const char* sql =
                "SELECT id, email FROM users WHERE username=? AND password_hash=?;";
            if (sqlite3_prepare_v2(db.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
                sendJson(res, 500, {{"error", "DB prepare failed"}});
                return;
            }
            sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, pwHash.c_str(),   -1, SQLITE_TRANSIENT);

            if (sqlite3_step(stmt) == SQLITE_ROW) {
                long long userId = sqlite3_column_int64(stmt, 0);
                std::string email =
                    reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
                sqlite3_finalize(stmt);
                std::string token = createJwt(userId, jwtSecret);
                sendJson(res, 200, {
                    {"token", token},
                    {"user", {{"id", userId}, {"username", username}, {"email", email}}}
                });
            } else {
                sqlite3_finalize(stmt);
                sendJson(res, 401, {{"error", "Invalid credentials"}});
            }
        } catch (const json::exception& e) {
            sendJson(res, 400, {{"error", e.what()}});
        }
    });
}

} // namespace budgie

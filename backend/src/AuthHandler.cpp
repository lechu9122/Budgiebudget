#include "AuthHandler.h"
#include "HttpUtil.h"
#include <nlohmann/json.hpp>
#include <openssl/sha.h>
#include <openssl/hmac.h>
#include <sstream>
#include <iomanip>
#include <stdexcept>
#include <iostream>
#include <ctime>
#include <vector>
#include <optional>

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

std::string createJwt(const std::string& userId, const std::string& secret) {
    std::string header = base64UrlEncodeStr(R"({"alg":"HS256","typ":"JWT"})");
    json payloadJson = {{"sub", userId}, {"iat", std::time(nullptr)}};
    std::string payload = base64UrlEncodeStr(payloadJson.dump());
    std::string signingInput = header + "." + payload;
    std::string sig = hmacSha256(secret, signingInput);
    return signingInput + "." + sig;
}

// Returns the user_id from the JWT, or nullopt on failure.
std::optional<std::string> verifyJwt(const std::string& token, const std::string& secret) {
    auto dot1 = token.find('.');
    auto dot2 = token.find('.', dot1 + 1);
    if (dot1 == std::string::npos || dot2 == std::string::npos) return std::nullopt;
    std::string signingInput = token.substr(0, dot2);
    std::string expectedSig = hmacSha256(secret, signingInput);
    std::string actualSig   = token.substr(dot2 + 1);
    if (expectedSig != actualSig) return std::nullopt;
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
        else return std::nullopt;
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
        return p.at("sub").get<std::string>();
    } catch (...) {
        return std::nullopt;
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

} // anonymous namespace

// ---------------------------------------------------------------------------

long long validateToken(const std::string& authHeader,
                        const std::string& jwtSecret) {
    auto userUuid = validateTokenUuid(authHeader, jwtSecret);
    if (!userUuid) return -1;
    try {
        return std::stoll(*userUuid);
    } catch (...) {
        return -1;
    }
}

// 2-arg: verify JWT signature and return raw subject string
std::optional<std::string> validateTokenUuid(const std::string& authHeader,
                                             const std::string& jwtSecret) {
    const std::string prefix = "Bearer ";
    if (authHeader.size() <= prefix.size() ||
        authHeader.substr(0, prefix.size()) != prefix) return std::nullopt;
    return verifyJwt(authHeader.substr(prefix.size()), jwtSecret);
}

namespace {
bool isUuidFormat(const std::string& s) {
    if (s.size() != 36) return false;
    for (size_t i = 0; i < 36; ++i) {
        if (i == 8 || i == 13 || i == 18 || i == 23) {
            if (s[i] != '-') return false;
        } else {
            char c = s[i];
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')))
                return false;
        }
    }
    return true;
}
} // namespace

// 3-arg: verify JWT + resolve subject to a real profiles UUID
std::optional<std::string> validateTokenUuid(const std::string& authHeader,
                                             const std::string& jwtSecret,
                                             Database& db) {
    auto subject = validateTokenUuid(authHeader, jwtSecret);
    if (!subject) return std::nullopt;

    // Already a valid UUID — use directly
    if (isUuidFormat(*subject)) return subject;

    // Legacy numeric subject — resolve via user_subject_map
    std::cerr << "[AUTH] Non-UUID subject '" << *subject
              << "', checking user_subject_map...\n";
    try {
        auto lock = db.connLock();
        pqxx::work txn(db.conn());
        pqxx::result r = txn.exec_params(
            "SELECT user_id::text FROM user_subject_map WHERE subject::text = $1",
            *subject
        );
        txn.commit();
        if (!r.empty()) {
            std::string uuid = r[0][0].as<std::string>();
            std::cerr << "[AUTH] Resolved subject '" << *subject
                      << "' to UUID '" << uuid << "'\n";
            return uuid;
        }
    } catch (const std::exception& e) {
        std::cerr << "[AUTH] user_subject_map lookup failed: " << e.what() << "\n";
    }

    std::cerr << "[AUTH] Could not resolve subject '" << *subject
              << "' to a UUID. Rejecting token.\n";
    return std::nullopt;
}

std::optional<std::string> resolveUserUuid(Database& db, long long tokenUserId) {
    try {
        auto lock = db.connLock();
        pqxx::work txn(db.conn());
        pqxx::result r = txn.exec_params(
            "SELECT user_id::text FROM user_subject_map WHERE subject = $1",
            tokenUserId
        );
        txn.commit();
        if (r.empty()) return std::nullopt;
        return r[0][0].as<std::string>();
    } catch (...) {
        return std::nullopt;
    }
}

void registerAuthRoutes(httplib::Server& svr, Database& db,
                        const std::string& jwtSecret) {
    // --- POST /api/auth/register ---
    svr.Post("/api/auth/register", [&db, &jwtSecret](
                 const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            std::string username = body.at("username").get<std::string>();
            std::string email    = body.at("email").get<std::string>();
            std::string name     = body.at("name").get<std::string>();
            std::string phone    = body.value("phone", "");
            std::string password = body.at("password").get<std::string>();

            if (username.empty() || email.empty() || name.empty() || password.size() < 6) {
                sendJson(res, 400,
                    {{"error", "username, email, name required; password must be >= 6 chars"}});
                return;
            }

            std::string pwHash = hashPassword(password);

            // Insert user using pqxx with explicit connection lock
            try {
                auto lock = db.connLock();
                pqxx::work txn(db.conn());
                std::string sql = R"(
                    INSERT INTO profiles (username, email, password_hash)
                    VALUES ($1, $2, $3)
                    RETURNING id
                )";
                pqxx::result r = txn.exec_params(sql, username, email, pwHash);
                
                if (r.empty()) {
                    sendJson(res, 500, {{"error", "Failed to create user"}});
                    return;
                }
                
                std::string userId = r[0][0].as<std::string>();
                txn.commit();
                
                std::cerr << "[INFO] User registered: " << username << " (" << userId << ")\n";

                std::string token = createJwt(userId, jwtSecret);
                sendJson(res, 201, {
                    {"token", token},
                    {"user", {
                        {"id", userId}, 
                        {"username", username}, 
                        {"email", email},
                        {"name", name}
                    }}
                });
            } catch (const pqxx::unique_violation& e) {
                std::cerr << "[ERROR] Registration unique violation: " << e.what() << "\n";
                sendJson(res, 409, {{"error", "Username or email already taken"}});
                return;
            } catch (const std::exception& e) {
                std::cerr << "[ERROR] Registration DB error: " << e.what() << "\n";
                sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
                return;
            }
        } catch (const json::exception& e) {
            std::cerr << "[ERROR] Registration JSON error: " << e.what() << "\n";
            sendJson(res, 400, {{"error", e.what()}});
        }
    });

    // --- POST /api/auth/login ---
    svr.Post("/api/auth/login", [&db, &jwtSecret](
                const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            std::string emailOrUsername = body.at("emailOrUsername").get<std::string>();
            std::string password = body.at("password").get<std::string>();
            std::string pwHash   = hashPassword(password);

            // Query user using pqxx - try both email and username
            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            std::string sql = R"(
                SELECT id, username, email FROM profiles 
                WHERE (email=$1 OR username=$1) AND password_hash=$2
            )";
            pqxx::result r = txn.exec_params(sql, emailOrUsername, pwHash);
            txn.commit();

            if (!r.empty()) {
                std::string userId = r[0][0].as<std::string>();
                std::string username = r[0][1].as<std::string>();
                std::string userEmail = r[0][2].as<std::string>();
                
                std::cerr << "[INFO] User logged in: " << username << "\n";

                std::string token = createJwt(userId, jwtSecret);
                sendJson(res, 200, {
                    {"token", token},
                    {"user", {
                        {"id", userId}, 
                        {"username", username}, 
                        {"email", userEmail}
                    }}
                });
            } else {
                std::cerr << "[WARN] Login failed for: " << emailOrUsername << "\n";
                sendJson(res, 401, {{"error", "Invalid email/username or password"}});
            }
        } catch (const json::exception& e) {
            std::cerr << "[ERROR] Login JSON error: " << e.what() << "\n";
            sendJson(res, 400, {{"error", e.what()}});
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] Login DB error: " << e.what() << "\n";
            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        }
    });
}

} // namespace budgie

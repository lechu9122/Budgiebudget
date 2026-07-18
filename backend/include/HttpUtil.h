#pragma once

#include <httplib.h>
#include <nlohmann/json.hpp>

namespace budgie {

/** Send a JSON response with the given HTTP status (shared by all handlers). */
inline void sendJson(httplib::Response& res, int status, const nlohmann::json& body) {
    res.status = status;
    res.set_content(body.dump(), "application/json");
}

} // namespace budgie

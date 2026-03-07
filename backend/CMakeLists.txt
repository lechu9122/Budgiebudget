cmake_minimum_required(VERSION 3.16)
project(BudgieBudgetBackend VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ---- Dependencies ----
# The backend requires:
#   - cpp-httplib  (header-only HTTP server, fetched via FetchContent)
#   - nlohmann/json (header-only JSON, fetched via FetchContent)
#   - SQLite3       (system package: libsqlite3-dev on Debian/Ubuntu)

include(FetchContent)

FetchContent_Declare(
  httplib
  GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
  GIT_TAG        v0.15.3
)

FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG        v3.11.3
)

FetchContent_MakeAvailable(httplib nlohmann_json)

find_package(SQLite3 REQUIRED)
find_package(OpenSSL REQUIRED)     # required by cpp-httplib for HTTPS support

# ---- Sources ----
add_executable(budgie_backend
  src/main.cpp
  src/Database.cpp
  src/AuthHandler.cpp
  src/BudgetHandler.cpp
  src/AiAdvisorHandler.cpp
)

target_include_directories(budgie_backend PRIVATE
  include
  ${SQLite3_INCLUDE_DIRS}
)

target_link_libraries(budgie_backend PRIVATE
  httplib::httplib
  nlohmann_json::nlohmann_json
  ${SQLite3_LIBRARIES}
  OpenSSL::SSL
  OpenSSL::Crypto
)

# ---- Install ----
install(TARGETS budgie_backend DESTINATION bin)

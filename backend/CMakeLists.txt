cmake_minimum_required(VERSION 3.16)
project(BudgieBudgetBackend VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

FetchContent_Declare(
  httplib
  GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
  GIT_TAG         v0.15.3
)

FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG         v3.11.3
)

FetchContent_MakeAvailable(httplib nlohmann_json)

# PostgreSQL Support
find_library(PQXX_LIB pqxx REQUIRED)
find_library(PQ_LIB pq REQUIRED)
find_package(OpenSSL REQUIRED)

add_executable(budgie_backend
  src/main.cpp
  src/Database.cpp
  src/AuthHandler.cpp
  src/BudgetHandler.cpp
  src/AiAdvisorHandler.cpp
  src/OnboardingHandler.cpp
)

target_include_directories(budgie_backend PRIVATE include)

target_link_libraries(budgie_backend PRIVATE
  httplib::httplib
  nlohmann_json::nlohmann_json
  ${PQXX_LIB}
  ${PQ_LIB}
  OpenSSL::SSL
  OpenSSL::Crypto
)
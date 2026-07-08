cmake_minimum_required(VERSION 3.16)
project(BudgieBudgetBackend VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Suppress libpqxx deprecation warnings
add_compile_options(-Wno-deprecated-declarations)

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

# PostgreSQL Support - help find libpq and libpqxx on macOS/Homebrew
if(APPLE)
  set(PostgreSQL_ROOT "/opt/homebrew/opt/libpq" "/opt/homebrew/opt/libpqxx")
  list(APPEND CMAKE_PREFIX_PATH ${PostgreSQL_ROOT})
  # Add Homebrew include and lib paths
  include_directories(/opt/homebrew/opt/libpq/include /opt/homebrew/opt/libpqxx/include)
  link_directories(/opt/homebrew/opt/libpq/lib /opt/homebrew/opt/libpqxx/lib)
endif()

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

# Add PostgreSQL include directories
if(APPLE)
  target_include_directories(budgie_backend PRIVATE 
    /opt/homebrew/opt/libpq/include 
    /opt/homebrew/opt/libpqxx/include
  )
endif()

target_link_libraries(budgie_backend PRIVATE
  httplib::httplib
  nlohmann_json::nlohmann_json
  ${PQXX_LIB}
  ${PQ_LIB}
  OpenSSL::SSL
  OpenSSL::Crypto
)
cmake_minimum_required(VERSION 3.21)
project(mbt_inspector LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)

set(USE_TLS OFF CACHE BOOL "Disable TLS for bootstrap inspector" FORCE)
set(USE_ZLIB OFF CACHE BOOL "Disable compression for bootstrap inspector" FORCE)
set(USE_OPEN_SSL OFF CACHE BOOL "Disable OpenSSL for bootstrap inspector" FORCE)
set(USE_MBED_TLS OFF CACHE BOOL "Disable mbedTLS for bootstrap inspector" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "Disable ixwebsocket tests" FORCE)

FetchContent_Declare(
  ixwebsocket
  GIT_REPOSITORY https://github.com/machinezone/IXWebSocket.git
  GIT_TAG v11.4.6
)

FetchContent_MakeAvailable(ixwebsocket)

add_executable(mbt_inspector src/main.cpp)

if(TARGET ixwebsocket)
  target_link_libraries(mbt_inspector PRIVATE ixwebsocket)
elseif(TARGET IXWebSocket::ixwebsocket)
  target_link_libraries(mbt_inspector PRIVATE IXWebSocket::ixwebsocket)
else()
  message(FATAL_ERROR "Unable to locate ixwebsocket CMake target")
endif()

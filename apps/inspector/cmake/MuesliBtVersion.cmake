if(NOT DEFINED MUESLI_BT_GIT_URL)
  set(MUESLI_BT_GIT_URL "https://github.com/unswei/muesli-bt" CACHE STRING "muesli-bt Git repository URL")
endif()

if(NOT DEFINED MUESLI_BT_GIT_TAG)
  # Immutable upstream pin for the v0.3.1 release line.
  set(MUESLI_BT_GIT_TAG "050c5e8793052d2a1a5d307897960d8b78e2afbc" CACHE STRING "Pinned muesli-bt Git tag or commit")
endif()

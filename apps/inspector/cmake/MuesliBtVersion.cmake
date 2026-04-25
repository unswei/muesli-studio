if(NOT DEFINED MUESLI_BT_GIT_URL)
  set(MUESLI_BT_GIT_URL "https://github.com/unswei/muesli-bt" CACHE STRING "muesli-bt Git repository URL")
endif()

if(NOT DEFINED MUESLI_BT_GIT_TAG)
  # Immutable upstream pin for the v0.6.0 release line.
  set(MUESLI_BT_GIT_TAG "654a1e43cdea4bfc2e0a5e4e15e472193ca32f94" CACHE STRING "Pinned muesli-bt Git tag or commit")
endif()

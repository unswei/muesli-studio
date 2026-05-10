if(NOT DEFINED MUESLI_BT_GIT_URL)
  set(MUESLI_BT_GIT_URL "https://github.com/unswei/muesli-bt" CACHE STRING "muesli-bt Git repository URL")
endif()

if(NOT DEFINED MUESLI_BT_GIT_TAG)
  # Immutable upstream pin for the v0.8.0 release line.
  set(MUESLI_BT_GIT_TAG "ff4dc9d7e160b2037ad66cac23e9536c48faaa5e" CACHE STRING "Pinned muesli-bt Git tag or commit")
endif()

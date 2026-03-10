if(NOT DEFINED MUESLI_BT_GIT_URL)
  set(MUESLI_BT_GIT_URL "https://github.com/unswei/muesli-bt" CACHE STRING "muesli-bt Git repository URL")
endif()

if(NOT DEFINED MUESLI_BT_GIT_TAG)
  # Immutable upstream pin for the v0.2.0 release line.
  set(MUESLI_BT_GIT_TAG "affa99d13995a7659bfddfeef08249a8365f4bc5" CACHE STRING "Pinned muesli-bt Git tag or commit")
endif()

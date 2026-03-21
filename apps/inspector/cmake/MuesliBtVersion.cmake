if(NOT DEFINED MUESLI_BT_GIT_URL)
  set(MUESLI_BT_GIT_URL "https://github.com/unswei/muesli-bt" CACHE STRING "muesli-bt Git repository URL")
endif()

if(NOT DEFINED MUESLI_BT_GIT_TAG)
  # Immutable upstream pin for the v0.4.0 release line.
  set(MUESLI_BT_GIT_TAG "6100092ad2cb1ad54145a945518bd55e65abdff8" CACHE STRING "Pinned muesli-bt Git tag or commit")
endif()

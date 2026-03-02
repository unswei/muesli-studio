if(NOT DEFINED MUESLI_BT_GIT_URL)
  set(MUESLI_BT_GIT_URL "https://github.com/unswei/muesli-bt" CACHE STRING "muesli-bt Git repository URL")
endif()

if(NOT DEFINED MUESLI_BT_GIT_TAG)
  set(MUESLI_BT_GIT_TAG "5db3e6d9c2688e75760710229c554dd33a4c5ae0" CACHE STRING "Pinned muesli-bt Git tag or commit")
endif()

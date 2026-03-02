if(NOT DEFINED MUESLI_BT_GIT_URL)
  set(MUESLI_BT_GIT_URL "https://github.com/unswei/muesli-bt" CACHE STRING "muesli-bt Git repository URL")
endif()

if(NOT DEFINED MUESLI_BT_GIT_TAG)
  set(MUESLI_BT_GIT_TAG "f89af4c98b67526b584421f25b402893b8ab3885" CACHE STRING "Pinned muesli-bt Git tag or commit")
endif()

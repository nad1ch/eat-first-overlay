<script setup>
import { BRAND_LOGO_SRC, STREAMER_NICK, STREAMER_TWITCH_URL } from '../../constants/brand.js'

defineProps({
  ariaLabel: { type: String, required: true },
  logoSize: { type: Number, default: 32 },
})
</script>

<template>
  <a
    class="app-shell-mini-brand"
    :href="STREAMER_TWITCH_URL"
    target="_blank"
    rel="noopener noreferrer"
    :aria-label="ariaLabel"
  >
    <img
      class="app-shell-mini-brand__logo"
      :src="BRAND_LOGO_SRC"
      :width="logoSize"
      :height="logoSize"
      alt=""
    />
    <span class="app-shell-mini-brand__nick">{{ STREAMER_NICK }}</span>
  </a>
</template>

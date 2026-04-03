<script setup>
import { useI18n } from 'vue-i18n'
import { BRAND_LOGO_PNG, BRAND_LOGO_WEBP, STREAMER_NICK, STREAMER_TWITCH_URL } from '../../constants/brand.js'

defineProps({
  year: { type: Number, required: true },
})

const { t } = useI18n()
</script>

<template>
  <footer class="app-site-footer">
    <div class="app-site-footer__inner">
      <a
        class="app-site-footer__brand-link"
        :href="STREAMER_TWITCH_URL"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="t('app.twitchAria')"
      >
        <div class="app-site-footer__logo-wrap">
          <picture>
            <source :srcset="BRAND_LOGO_WEBP" type="image/webp" />
            <img
              class="app-site-footer__logo"
              :src="BRAND_LOGO_PNG"
              width="44"
              height="44"
              alt=""
              decoding="async"
              fetchpriority="low"
            />
          </picture>
        </div>
        <span class="app-site-footer__nick">{{ STREAMER_NICK }}</span>
      </a>
      <div class="app-site-footer__meta">
        <p class="app-site-footer__copy">
          {{ t('app.footerLine', { year }) }}
        </p>
      </div>
    </div>
  </footer>
</template>

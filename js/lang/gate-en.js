'use strict'
// Discord gate strings (group gate). Families: h_ (headline), v_ (value lines), tr_ (trust strip), st_ (stage names), s_ (status per state),
// d_ (denied by reason), b_ (buttons), g_ (granted).
globalThis.LANG = globalThis.LANG || { en: {}, fi: {} }
LANG.en.gate = {
  h_title: 'Your PC, tuned for games.', h_sub: 'Jylli Tool is for members of the Jylli Tool Discord server. Link your Discord once and you are in.',
  v_1: 'Tune Windows for gaming in a few clicks', v_2: 'Every change can be undone with a restore point', v_3: 'Your settings stay on this PC',
  tr_1: 'You sign in on discord.com. Jylli Tool never sees your password.', tr_2: 'Your session is encrypted on this PC.', tr_3: 'It stays valid for 30 days.',
  st_browser: 'Browser opened', st_approve: 'Approve in Discord', st_verify: 'Membership checked', st_unlocked: 'Unlocked',
  s_idle: 'Ready when you are', s_expired: 'Your session ended. Sign in again to keep going.', s_opening: 'Opening your browser',
  s_waiting: 'Approve Jylli Tool in the browser tab that just opened.', s_verify: 'Checking your membership and key',
  s_browserFailed: 'The browser did not open. Open the link yourself or copy it.',
  s_timeout: 'The sign-in window closed after 2 minutes. Nothing was changed.', s_offline: 'Could not reach the server. Check your connection. Jylli Tool tries again when you are back online.',
  s_checking: 'Checking your saved session', s_noSession: 'No saved session on this PC yet. Link Discord to start one.',
  s_denied: 'Not signed in',
  d_member: 'Your Discord account is not in the Jylli Tool server yet. Join it, then check again.',
  d_key: 'The server key could not be verified. Update Jylli Tool or try again.',
  d_expired: 'That sign-in link expired. Start again.',
  d_cancelled: 'You cancelled the sign-in. Nothing was shared. Start again when you are ready.',
  d_banned: 'This Discord account cannot use Jylli Tool. If you think this is a mistake, contact the server staff.',
  d_error: 'Discord did not answer as expected. Nothing was changed. Try again.',
  b_link: 'Link Discord', b_cancel: 'Cancel', b_again: 'Try again', b_join: 'Join the server', b_joined: 'I joined, check again',
  b_reopen: 'Open again', b_copy: 'Copy link', b_copied: 'Copied', b_saved: 'Check saved session', b_lang: 'Language', b_min: 'Minimize', b_close: 'Close',
  left: '{n} s left', hasAccess: 'Already signed in on this PC?',
  g_welcome: 'Welcome', g_premium: 'Premium is unlocked.', g_free: 'Free plan is active. Premium adds more tools whenever you want it.', g_loading: 'Starting Jylli Tool',
  aria_dial: 'Sign-in progress',
}

(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const body = document.body;
  const cover = $('#cover');
  const openBtn = $('#openInvite');
  const invitation = $('#invitation');
  const musicBtn = $('#musicBtn');
  const guestEl = $('#guestName');
  const dock = $('.dock');
  const toast = $('#toast');

  /* ---------- Guest name ---------- */
  const params = new URLSearchParams(window.location.search);
  const guestParam = params.get('to') || params.get('kepada') || params.get('nama');
  if (guestParam) {
    const clean = guestParam.trim().slice(0, 60);
    if (clean) guestEl.textContent = clean;
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add('is-show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-show'), 2800);
  };

  /* ---------- Ambient music ---------- */
  const Music = (() => {
    let ctx = null;
    let master = null;
    let playing = false;
    let chordTimer = null;
    let melodyTimer = null;
    let chordIndex = 0;

    const chords = [
      [146.83, 220.0, 293.66],
      [123.47, 185.0, 246.94],
      [98.0, 146.83, 196.0],
      [110.0, 164.81, 220.0]
    ];
    const melody = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25];

    function updateButton(isPlaying) {
      musicBtn.classList.toggle('is-on', isPlaying);
      musicBtn.setAttribute('aria-pressed', String(isPlaying));
      musicBtn.setAttribute('aria-label', isPlaying ? 'Matikan musik' : 'Nyalakan musik');
    }

    function route(node, pan) {
      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        node.connect(panner);
        panner.connect(master);
      } else {
        node.connect(master);
      }
    }

    function ensureContext() {
      if (ctx) return true;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;

      try {
        ctx = new AudioCtx();
        master = ctx.createGain();
        master.gain.value = 0.0001;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2400;

        const delay = ctx.createDelay(1.2);
        delay.delayTime.value = 0.52;

        const feedback = ctx.createGain();
        feedback.gain.value = 0.26;

        const wet = ctx.createGain();
        wet.gain.value = 0.16;

        master.connect(filter);
        filter.connect(ctx.destination);
        filter.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(ctx.destination);
        return true;
      } catch (error) {
        return false;
      }
    }

    function pad(freq, when, duration, pan) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(0.032, when + duration * 0.35);
      gain.gain.linearRampToValueAtTime(0.0001, when + duration);
      route(gain, pan);

      [
        ['sine', -3],
        ['triangle', 5]
      ].forEach(([type, detune]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = detune;
        osc.connect(gain);
        osc.start(when);
        osc.stop(when + duration + 0.1);
      });
    }

    function pluck() {
      if (!playing) return;
      if (Math.random() < 0.34) return;

      const when = ctx.currentTime + 0.05;
      const freq = melody[Math.floor(Math.random() * melody.length)] * (Math.random() < 0.2 ? 2 : 1);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(0.05, when + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 2.7);
      route(gain, Math.random() * 0.5 - 0.25);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(when);
      osc.stop(when + 2.8);
    }

    function playChord() {
      if (!playing) return;
      const now = ctx.currentTime + 0.05;
      chords[chordIndex].forEach((freq, index) => {
        pad(freq, now, 8.6, (index - 1) * 0.12);
      });
      chordIndex = (chordIndex + 1) % chords.length;
    }

    function start() {
      if (!ensureContext()) return false;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      playing = true;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.linearRampToValueAtTime(0.9, now + 2.6);

      if (!chordTimer) {
        playChord();
        chordTimer = window.setInterval(playChord, 8500);
      }
      if (!melodyTimer) {
        melodyTimer = window.setInterval(pluck, 3300);
        window.setTimeout(pluck, 1900);
      }

      updateButton(true);
      return true;
    }

    function stop() {
      if (!ctx) return;
      playing = false;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.7);

      window.clearInterval(chordTimer);
      window.clearInterval(melodyTimer);
      chordTimer = null;
      melodyTimer = null;
      updateButton(false);
    }

    function toggle() {
      if (playing) {
        stop();
        return false;
      }
      return start();
    }

    return { start, toggle };
  })();

  /* ---------- Open invitation ---------- */
  let opened = false;
  let revealObserver = null;

  function setupReveal() {
    const revealEls = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
      revealEls.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );

    revealEls.forEach((el) => revealObserver.observe(el));
  }

  function openInvitation() {
    if (opened) return;
    opened = true;

    body.classList.remove('is-locked');
    body.classList.add('is-open');
    cover.setAttribute('aria-hidden', 'true');
    invitation.removeAttribute('aria-hidden');
    invitation.inert = false;
    dock.inert = false;
    musicBtn.inert = false;

    if (!Music.start()) {
      musicBtn.hidden = true;
      showToast('Musik tidak dapat diputar di perangkat ini.');
    }

    window.setTimeout(setupReveal, 260);
    window.setTimeout(() => {
      cover.hidden = true;
    }, 1250);
  }

  invitation.inert = true;
  dock.inert = true;
  musicBtn.inert = true;
  openBtn.addEventListener('click', openInvitation);

  /* ---------- Music button ---------- */
  musicBtn.addEventListener('click', () => {
    if (!Music.toggle()) {
      showToast('Musik dinonaktifkan.');
    }
  });

  /* ---------- Countdown ---------- */
  const target = new Date('2026-12-12T09:00:00+07:00').getTime();
  const cdDays = $('#cdDays');
  const cdHours = $('#cdHours');
  const cdMinutes = $('#cdMinutes');
  const cdSeconds = $('#cdSeconds');
  const pad2 = (value) => String(value).padStart(2, '0');
  let countdownTimer = null;

  function updateCountdown() {
    const diff = target - Date.now();
    if (diff <= 0) {
      cdDays.textContent = '00';
      cdHours.textContent = '00';
      cdMinutes.textContent = '00';
      cdSeconds.textContent = '00';
      if (countdownTimer) {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
      }
      return;
    }

    const seconds = Math.floor(diff / 1000);
    cdDays.textContent = pad2(Math.floor(seconds / 86400));
    cdHours.textContent = pad2(Math.floor((seconds % 86400) / 3600));
    cdMinutes.textContent = pad2(Math.floor((seconds % 3600) / 60));
    cdSeconds.textContent = pad2(seconds % 60);
  }

  updateCountdown();
  countdownTimer = window.setInterval(updateCountdown, 1000);

  /* ---------- Active dock item ---------- */
  const dockLinks = $$('.dock__item');
  const navSections = dockLinks
    .map((link) => document.getElementById(link.dataset.target))
    .filter(Boolean);
  let scrollTicking = false;

  function updateActiveNav() {
    const marker = window.scrollY + window.innerHeight * 0.35;
    let currentId = navSections[0] ? navSections[0].id : null;

    navSections.forEach((section) => {
      if (section.offsetTop <= marker) currentId = section.id;
    });

    dockLinks.forEach((link) => {
      const isActive = link.dataset.target === currentId;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  window.addEventListener(
    'scroll',
    () => {
      if (scrollTicking) return;
      scrollTicking = true;
      window.requestAnimationFrame(() => {
        updateActiveNav();
        scrollTicking = false;
      });
    },
    { passive: true }
  );
  window.addEventListener('resize', updateActiveNav);

  /* ---------- Lightbox ---------- */
  const lightbox = $('#lightbox');
  const lbImg = $('#lbImg');
  const lbCaption = $('#lbCaption');
  const lbClose = $('#lbClose');
  const lbPrev = $('#lbPrev');
  const lbNext = $('#lbNext');
  const galleryButtons = $$('.gallery-item__btn');

  const galleryItems = galleryButtons.map((button) => ({
    src: button.dataset.full,
    caption: button.dataset.caption || '',
    alt: $('img', button) ? $('img', button).alt : ''
  }));

  let currentImage = 0;
  let lastFocused = null;

  function renderLightbox() {
    const item = galleryItems[currentImage];
    if (!item) return;
    lbImg.src = item.src;
    lbImg.alt = item.alt;
    lbCaption.textContent = item.caption;
  }

  function openLightbox(index, trigger) {
    if (!galleryItems.length) return;
    lastFocused = trigger || document.activeElement;
    currentImage = index;
    renderLightbox();
    lightbox.hidden = false;
    body.classList.add('no-scroll');
    window.requestAnimationFrame(() => lightbox.classList.add('is-visible'));
    lbClose.focus({ preventScroll: true });
  }

  function closeLightbox() {
    lightbox.classList.remove('is-visible');
    body.classList.remove('no-scroll');
    window.setTimeout(() => {
      lightbox.hidden = true;
      if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus({ preventScroll: true });
      }
    }, 280);
  }

  function stepLightbox(direction) {
    if (!galleryItems.length) return;
    currentImage = (currentImage + direction + galleryItems.length) % galleryItems.length;
    renderLightbox();
  }

  galleryButtons.forEach((button, index) => {
    button.addEventListener('click', () => openLightbox(index, button));
  });
  lbClose.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', () => stepLightbox(-1));
  lbNext.addEventListener('click', () => stepLightbox(1));

  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (event) => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') {
      closeLightbox();
    } else if (event.key === 'ArrowRight') {
      stepLightbox(1);
    } else if (event.key === 'ArrowLeft') {
      stepLightbox(-1);
    } else if (event.key === 'Tab') {
      const focusables = [lbClose, lbPrev, lbNext];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  let touchStartX = null;
  lightbox.addEventListener(
    'touchstart',
    (event) => {
      touchStartX = event.touches[0].clientX;
    },
    { passive: true }
  );
  lightbox.addEventListener(
    'touchend',
    (event) => {
      if (touchStartX === null) return;
      const delta = event.changedTouches[0].clientX - touchStartX;
      if (Math.abs(delta) > 45) stepLightbox(delta < 0 ? 1 : -1);
      touchStartX = null;
    },
    { passive: true }
  );

  /* ---------- Copy buttons ---------- */
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // Fall through to the legacy path.
      }
    }

    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.top = '-1000px';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (error) {
      success = false;
    }
    helper.remove();
    return success;
  }

  $$('.copy-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const success = await copyText(button.dataset.copy || '');
      if (!success) {
        showToast('Gagal menyalin. Silakan salin secara manual.');
        return;
      }

      const label = $('span', button);
      const originalLabel = label ? label.textContent : '';
      button.classList.add('is-copied');
      if (label) label.textContent = 'Tersalin';
      showToast('Berhasil disalin ke papan klip.');

      window.setTimeout(() => {
        button.classList.remove('is-copied');
        if (label) label.textContent = originalLabel;
      }, 2200);
    });
  });

  /* ---------- Wishes / RSVP ---------- */
  const STORAGE_KEY = 'lian-fina-wishes-v1';
  const wishesEl = $('#wishes');
  const wishesCount = $('#wishesCount');
  const rsvpForm = $('#rsvpForm');
  const rsvpName = $('#rsvpName');
  const rsvpGuests = $('#rsvpGuests');
  const rsvpMessage = $('#rsvpMessage');
  const charCount = $('#charCount');

  const seedWishes = [
    {
      name: 'Keluarga Sitompul',
      message: 'Horas! Turut berbahagia untuk Lian dan Fina. Semoga menjadi keluarga yang saling menguatkan.',
      attendance: 'Hadir',
      ts: Date.now() - 1000 * 60 * 60 * 30
    },
    {
      name: 'Ruth br. Panjaitan',
      message: 'Selamat menempuh hidup baru. Kiranya sukacita hari ini tinggal bersama kalian selamanya.',
      attendance: 'Hadir',
      ts: Date.now() - 1000 * 60 * 60 * 52
    },
    {
      name: 'Andre & Melda',
      message: 'Maaf belum bisa memastikan kehadiran, tetapi doa kami menyertai. Horas!',
      attendance: 'Masih Ragu',
      ts: Date.now() - 1000 * 60 * 60 * 76
    }
  ];

  function readStoredWishes() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  let storedWishes = readStoredWishes();

  function persistWishes() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedWishes.slice(0, 40)));
    } catch (error) {
      // Storage can be unavailable in private mode; the wishes still render for this session.
    }
  }

  function initialsOf(name) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase() || 'T';
  }

  function timeAgo(ts) {
    const diff = Date.now() - Number(ts);
    if (!Number.isFinite(diff) || diff < 0) return 'Baru saja';
    if (diff < 60000) return 'Baru saja';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} menit lalu`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} jam lalu`;
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(Number(ts)));
  }

  const badgeClass = {
    Hadir: 'wish__badge--hadir',
    'Masih Ragu': 'wish__badge--ragu',
    'Tidak Hadir': 'wish__badge--tidak'
  };

  function renderWishes() {
    const all = [...storedWishes, ...seedWishes].sort((a, b) => Number(b.ts) - Number(a.ts));
    wishesEl.textContent = '';
    wishesCount.textContent = `${all.length} ucapan`;

    all.forEach((wish, index) => {
      const article = document.createElement('article');
      article.className = 'wish';
      article.style.animationDelay = `${Math.min(index * 0.04, 0.2)}s`;

      const avatar = document.createElement('div');
      avatar.className = 'wish__avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = initialsOf(wish.name || 'Tamu');

      const content = document.createElement('div');
      const head = document.createElement('div');
      head.className = 'wish__head';

      const name = document.createElement('span');
      name.className = 'wish__name';
      name.textContent = wish.name || 'Tamu Undangan';
      head.appendChild(name);

      if (wish.attendance) {
        const badge = document.createElement('span');
        badge.className = `wish__badge ${badgeClass[wish.attendance] || 'wish__badge--ragu'}`;
        badge.textContent = wish.attendance;
        head.appendChild(badge);
      }

      const message = document.createElement('p');
      message.className = 'wish__message';
      message.textContent = wish.message || 'Turut berbahagia.';

      const time = document.createElement('p');
      time.className = 'wish__time';
      time.textContent = timeAgo(wish.ts);

      content.appendChild(head);
      content.appendChild(message);
      content.appendChild(time);
      article.appendChild(avatar);
      article.appendChild(content);
      wishesEl.appendChild(article);
    });
  }

  renderWishes();

  rsvpMessage.addEventListener('input', () => {
    charCount.textContent = String(rsvpMessage.value.length);
  });

  rsvpForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = rsvpName.value.trim();

    if (name.length < 2) {
      showToast('Mohon isi nama Anda terlebih dahulu.');
      rsvpName.focus();
      return;
    }

    const attendanceInput = $('input[name="attendance"]:checked', rsvpForm);
    const newWish = {
      name: name.slice(0, 60),
      attendance: attendanceInput ? attendanceInput.value : 'Hadir',
      guests: rsvpGuests.value,
      message: rsvpMessage.value.trim().slice(0, 280) || 'Turut berbahagia atas pernikahan Parulian & Serafina.',
      ts: Date.now()
    };

    storedWishes = [newWish, ...storedWishes].slice(0, 40);
    persistWishes();
    renderWishes();
    rsvpForm.reset();
    charCount.textContent = '0';
    wishesEl.scrollTop = 0;
    showToast('Terima kasih! Ucapan Anda sudah tampil.');
  });

  /* ---------- Share ---------- */
  const shareBtn = $('#shareBtn');
  shareBtn.addEventListener('click', async () => {
    const shareData = {
      title: 'Undangan Pernikahan Parulian & Serafina',
      text: 'Kami mengundang Bapak/Ibu/Saudara/i untuk hadir di hari bahagia kami, Sabtu 12 Desember 2026.',
      url: window.location.href.split('#')[0]
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }

    const copied = await copyText(shareData.url);
    showToast(copied ? 'Tautan undangan berhasil disalin.' : 'Salin tautan undangan secara manual.');
  });
})();

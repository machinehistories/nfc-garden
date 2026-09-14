(() => {
  "use strict";

  const TAGS = {
    stone: { label: "Stone", glyph: "●", color: "#c7d0c2", description: "Roots the garden with a low, patient tone." },
    flower: { label: "Flower", glyph: "✽", color: "#ff94c8", description: "Opens a bright melodic branch." },
    cloud: { label: "Cloud", glyph: "☁", color: "#9dd9ff", description: "Leaves a soft suspended tone in the sky." },
    spiral: { label: "Spiral", glyph: "◉", color: "#c4a1ff", description: "Bends the melody back toward an earlier note." },
    sun: { label: "Sun", glyph: "☀", color: "#ffdd63", description: "Lifts the register and warms the harmony." },
    moon: { label: "Moon", glyph: "◒", color: "#aab9ff", description: "Turns the next note toward the darker mode." },
    rest: { label: "Rest", glyph: "○", color: "#799087", description: "Gives the shared composition a breath." },
    lightning: { label: "Lightning", glyph: "ϟ", color: "#e8ff6a", description: "Strikes a short percussive spark." },
  };

  const config = window.WEATHER_GARDEN_CONFIG || {};
  const apiUrl = String(config.apiUrl || "").replace(/\/$/, "");
  const params = new URLSearchParams(location.search);
  let selectedTag = TAGS[params.get("tag")] ? params.get("tag") : "flower";
  let audioContext = null;
  let soundEnabled = true;
  let currentEvents = [];
  let submitting = false;

  const $ = (id) => document.getElementById(id);
  const els = {
    glyph: $("glyph"), title: $("tagTitle"), description: $("tagDescription"),
    contribute: $("contribute"), contributeLabel: $("contributeLabel"), status: $("status"),
    steps: $("steps"), picker: $("tagPicker"), replay: $("replay"), sound: $("soundToggle"),
    sky: $("skyValue"), scale: $("scaleValue"), wind: $("windValue"), visitors: $("visitorValue"),
    mode: $("modeLabel"), canvas: $("sky"),
  };

  function clientId() {
    let id = localStorage.getItem("weatherGardenClient");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      localStorage.setItem("weatherGardenClient", id);
    }
    return id;
  }

  function selectTag(tag, updateUrl = true) {
    selectedTag = TAGS[tag] ? tag : "flower";
    const item = TAGS[selectedTag];
    document.documentElement.style.setProperty("--tag-color", item.color);
    els.glyph.textContent = item.glyph;
    els.title.textContent = item.label;
    els.description.textContent = item.description;
    els.contributeLabel.textContent = selectedTag === "rest" ? "Add a breath" : `Add ${article(item.label)} ${item.label.toLowerCase()}`;
    document.querySelectorAll(".tag-card").forEach((card) => card.classList.toggle("active", card.dataset.tag === selectedTag));
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("tag", selectedTag);
      history.replaceState({}, "", url);
    }
  }

  function article(word) { return /^[aeiou]/i.test(word) ? "an" : "a"; }

  function createPicker() {
    Object.entries(TAGS).forEach(([key, tag]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tag-card";
      button.dataset.tag = key;
      button.style.setProperty("--card-color", tag.color);
      button.innerHTML = `<span>${tag.glyph}</span><b>${tag.label}</b>`;
      button.addEventListener("click", () => selectTag(key));
      els.picker.appendChild(button);
    });
  }

  function noteName(note) {
    if (note == null) return "Rest";
    const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
    return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
  }

  function synth(event, when = 0) {
    if (!soundEnabled || event.note == null) return;
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioContext;
    const start = ctx.currentTime + when;
    const duration = Math.max(0.08, Math.min(2.4, event.duration || 0.45));
    const frequency = 440 * Math.pow(2, (event.note - 69) / 12);
    const oscillator = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();
    const overtoneGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    oscillator.type = event.tag === "lightning" ? "square" : event.tag === "stone" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    overtone.type = "sine";
    overtone.frequency.setValueAtTime(frequency * (event.tag === "cloud" ? 1.5 : 2), start);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(event.tag === "stone" ? 900 : 2800, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.02, (event.velocity || 80) / 900), start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    overtoneGain.gain.setValueAtTime(0.035, start);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.8);
    oscillator.connect(filter).connect(gain).connect(ctx.destination);
    overtone.connect(overtoneGain).connect(filter);
    oscillator.start(start); overtone.start(start);
    oscillator.stop(start + duration + 0.05); overtone.stop(start + duration + 0.05);
  }

  function renderState(state) {
    currentEvents = state.events || [];
    const padded = [...Array(Math.max(0, 16 - currentEvents.length)).fill(null), ...currentEvents].slice(-16);
    els.steps.innerHTML = "";
    padded.forEach((event) => {
      const step = document.createElement("div");
      if (!event) {
        step.className = "step rest";
        step.title = "Waiting";
      } else {
        const tag = TAGS[event.tag] || TAGS.flower;
        step.className = `step ${event.note == null ? "rest" : ""}`;
        const height = event.note == null ? 4 : 28 + ((event.note - 36) / 48) * 102;
        step.style.setProperty("--height", `${Math.max(18, Math.min(130, height))}px`);
        step.style.setProperty("--color", tag.color);
        step.title = `${tag.label}: ${noteName(event.note)}`;
      }
      els.steps.appendChild(step);
    });
    const weather = state.weather || {};
    els.sky.textContent = weather.summary || "Calm";
    els.scale.textContent = state.scale || "D Dorian";
    els.wind.textContent = weather.windKph != null ? `${Math.round(weather.windKph)} km/h` : "—";
    els.visitors.textContent = String(state.visitorCount || currentEvents.length || 0);
    drawSky(currentEvents);
  }

  function localState(tagToAdd = null) {
    const key = "weatherGardenEvents";
    const stored = JSON.parse(localStorage.getItem(key) || "[]");
    if (tagToAdd) {
      const base = { stone: 43, flower: 62, cloud: 69, spiral: 57, sun: 74, moon: 53, lightning: 79 };
      const event = {
        id: `${Date.now()}-${Math.random()}`,
        tag: tagToAdd,
        note: tagToAdd === "rest" ? null : base[tagToAdd],
        velocity: tagToAdd === "lightning" ? 110 : 82,
        duration: tagToAdd === "lightning" ? 0.12 : tagToAdd === "cloud" ? 1.6 : 0.55,
        createdAt: new Date().toISOString(),
      };
      stored.push(event);
      localStorage.setItem(key, JSON.stringify(stored.slice(-64)));
    }
    return {
      events: stored.slice(-16), scale: "D Dorian",
      visitorCount: new Set(stored.map((e) => e.id.split("-")[0])).size,
      weather: { summary: "Local weather preview", temperatureC: 18, cloudCover: 38, windKph: 11 },
    };
  }

  async function fetchState() {
    if (!apiUrl) return renderState(localState());
    try {
      const response = await fetch(`${apiUrl}/api/state`);
      if (!response.ok) throw new Error("The garden is resting");
      renderState(await response.json());
    } catch (error) {
      els.status.textContent = `${error.message}. Showing this device’s preview.`;
      renderState(localState());
    }
  }

  async function contribute() {
    if (submitting) return;
    submitting = true;
    els.contribute.disabled = true;
    els.status.textContent = "Listening to the weather…";
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      let state;
      if (apiUrl) {
        const response = await fetch(`${apiUrl}/api/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: selectedTag, clientId: clientId() }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "The garden could not hear this touch");
        state = payload;
      } else {
        state = localState(selectedTag);
      }
      renderState(state);
      const event = state.event || state.events[state.events.length - 1];
      synth(event);
      els.status.textContent = event.note == null
        ? "You added a breath to the garden."
        : `You added ${noteName(event.note)} in ${state.scale}.`;
      pulseLatest();
    } catch (error) {
      els.status.textContent = error.message;
    } finally {
      submitting = false;
      els.contribute.disabled = false;
    }
  }

  function pulseLatest() {
    const last = els.steps.lastElementChild;
    if (!last) return;
    last.classList.add("playing");
    setTimeout(() => last.classList.remove("playing"), 600);
  }

  async function replay() {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    currentEvents.slice(-16).forEach((event, index) => {
      synth(event, index * 0.22);
      setTimeout(() => {
        const children = [...els.steps.children];
        const offset = 16 - Math.min(16, currentEvents.length);
        const el = children[offset + index];
        if (el) {
          el.classList.add("playing");
          setTimeout(() => el.classList.remove("playing"), 170);
        }
      }, index * 220);
    });
  }

  function drawSky(events) {
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const points = events.slice(-16).map((event, i) => ({
      x: ((i * 97 + 61) % 89) / 100 * innerWidth + innerWidth * 0.05,
      y: ((i * 53 + 19) % 78) / 100 * innerHeight + innerHeight * 0.08,
      color: (TAGS[event.tag] || TAGS.flower).color,
    }));
    ctx.lineWidth = 0.8;
    points.forEach((point, i) => {
      const next = points[i + 1];
      if (next) {
        ctx.strokeStyle = "rgba(190,230,215,.13)";
        ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(next.x, next.y); ctx.stroke();
      }
      ctx.fillStyle = point.color;
      ctx.globalAlpha = 0.52;
      ctx.beginPath(); ctx.arc(point.x, point.y, 1.6 + (i % 3), 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  createPicker();
  selectTag(selectedTag, false);
  els.mode.textContent = apiUrl ? "Shared garden online" : "Local preview · add API URL to share";
  els.contribute.addEventListener("click", contribute);
  els.replay.addEventListener("click", replay);
  els.sound.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    els.sound.textContent = soundEnabled ? "Sound on" : "Sound off";
    els.sound.setAttribute("aria-pressed", String(!soundEnabled));
  });
  addEventListener("resize", () => drawSky(currentEvents));
  fetchState();
  if (apiUrl) setInterval(fetchState, 8000);
})();


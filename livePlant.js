/**
 * livePlant.js — Modular Live Plant focus tracker
 * State machine (health 0–100), SVG growth stages, wilting colors.
 */
const LivePlant = (() => {
  const SPECIES = ['fern', 'sunflower', 'oak'];
  const STAGE = {
    SEEDLING: 'seedling',
    GROWING: 'growing',
    FLOURISHING: 'flourishing'
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function capitalize(text) {
    return String(text || '').charAt(0).toUpperCase() + String(text || '').slice(1);
  }

  function readHealth(sessionOrHealth) {
    if (typeof sessionOrHealth === 'number') return clamp(sessionOrHealth, 0, 100);
    if (!sessionOrHealth) return 0;
    return clamp(
      Math.round(sessionOrHealth.plant_health ?? sessionOrHealth.focus_score ?? 0),
      0,
      100
    );
  }

  function getStage(health) {
    const h = readHealth(health);
    if (h >= 67) return STAGE.FLOURISHING;
    if (h >= 34) return STAGE.GROWING;
    return STAGE.SEEDLING;
  }

  function pickSpecies() {
    return SPECIES[Math.floor(Math.random() * SPECIES.length)];
  }

  function syncSpecies(health, currentSpecies) {
    if (readHealth(health) >= 67) {
      return currentSpecies || pickSpecies();
    }
    return currentSpecies || null;
  }

  function getStageLabel(health, species) {
    const h = readHealth(health);
    const stage = getStage(h);
    if (stage === STAGE.FLOURISHING && species) {
      return `${capitalize(species)} — Flourishing`;
    }
    if (stage === STAGE.GROWING) return 'Growing';
    if (h <= 12) return 'Seedling';
    if (h < 34) return 'Sprouting';
    return 'Wilting';
  }

  function getAccentColor(health) {
    const h = readHealth(health) / 100;
    const hue = 12 + h * 108;
    const sat = 28 + h * 52;
    const light = 32 + h * 18;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  }

  function getWiltingVars(health) {
    const h = readHealth(health) / 100;
    return {
      '--plant-hue': String(12 + h * 108),
      '--plant-sat': `${28 + h * 52}%`,
      '--plant-light': `${32 + h * 18}%`,
      '--stem-light': `${24 + h * 16}%`,
      '--leaf-opacity': String(clamp(0.15 + h * 0.85, 0.15, 1)),
      '--stem-scale': String(0.22 + h * 0.78),
      '--leaf-scale': String(0.35 + h * 0.65),
      '--canopy-scale': String(0.4 + h * 0.6)
    };
  }

  function computeStemTop(health) {
    const h = readHealth(health) / 100;
    return 98 - (8 + h * 58);
  }

  function updateStemPath(svg, stemTop) {
    const stem = svg.querySelector('#plantStemPath');
    if (!stem) return;
    const midY = (98 + stemTop) / 2;
    stem.setAttribute(
      'd',
      `M50 98 C49 ${midY + 6} 51 ${midY - 4} 50 ${stemTop.toFixed(1)}`
    );
  }

  function updateLeafPaths(svg, health, stemTop) {
    const spread = clamp(readHealth(health) / 100, 0, 1);
    const left = svg.querySelector('#seedLeafLeft');
    const right = svg.querySelector('#seedLeafRight');
    const gLeft = svg.querySelector('#growLeafLeft');
    const gRight = svg.querySelector('#growLeafRight');

    if (left && right) {
      const w = 6 + spread * 7;
      const y = stemTop + 4;
      left.setAttribute('d', `M50 ${y} Q${50 - w} ${y - 3} ${50 - w - 2} ${y + 5} Q${50 - 4} ${y + 2} 50 ${y}`);
      right.setAttribute('d', `M50 ${y} Q${50 + w} ${y - 3} ${50 + w + 2} ${y + 5} Q${50 + 4} ${y + 2} 50 ${y}`);
    }

    if (gLeft && gRight) {
      const y = stemTop - 2;
      const w = 14 + spread * 16;
      gLeft.setAttribute('d', `M50 ${y} Q${50 - w} ${y - 10} ${50 - w + 4} ${y + 8} Q${50 - 6} ${y + 4} 50 ${y}`);
      gRight.setAttribute('d', `M50 ${y} Q${50 + w} ${y - 10} ${50 + w - 4} ${y + 8} Q${50 + 6} ${y + 4} 50 ${y}`);
    }
  }

  function renderPlant(rootEl, sessionOrHealth, speciesOverride) {
    if (!rootEl) return readHealth(sessionOrHealth);

    const health = readHealth(sessionOrHealth);
    const species = speciesOverride
      ?? (typeof sessionOrHealth === 'object' ? sessionOrHealth.plant_species : null)
      ?? null;
    const stage = getStage(health);
    const stemTop = computeStemTop(health);
    const svg = rootEl.querySelector('.live-plant') || rootEl;

    Object.entries(getWiltingVars(health)).forEach(([key, value]) => {
      rootEl.style.setProperty(key, value);
    });

    rootEl.dataset.stage = stage;
    rootEl.dataset.species = stage === STAGE.FLOURISHING && species ? species : '';
    rootEl.dataset.health = String(health);

    updateStemPath(svg, stemTop);
    updateLeafPaths(svg, health, stemTop);

    return health;
  }

  class PlantStateMachine {
    constructor(initialHealth = 0, species = null) {
      this.health = readHealth(initialHealth);
      this.species = species;
    }

    static fromSession(session) {
      if (!session) return new PlantStateMachine(0, null);
      return new PlantStateMachine(
        readHealth(session),
        session.plant_species || null
      );
    }

    applyPenalty(amount = 5) {
      this.health = clamp(this.health - amount, 0, 100);
      return this.health;
    }

    applyReward(amount) {
      this.health = clamp(this.health + amount, 0, 100);
      if (this.health >= 67 && !this.species) {
        this.species = pickSpecies();
      }
      return this.health;
    }

    toSessionFields() {
      return {
        plant_health: this.health,
        plant_species: syncSpecies(this.health, this.species),
        focus_score: this.health
      };
    }
  }

  return {
    SPECIES,
    STAGE,
    clamp,
    readHealth,
    getStage,
    getStageLabel,
    getAccentColor,
    getWiltingVars,
    pickSpecies,
    syncSpecies,
    renderPlant,
    PlantStateMachine
  };
})();

if (typeof window !== 'undefined') {
  window.LivePlant = LivePlant;
}

window.APP = {
  template: '#app_template',
  name: 'app',
  data() {
    return {
      baseStyle: CONFIG.style || {},
      showInput: false,
      showWindow: false,
      shouldHide: true,
      showStylePanel: false,
      styleEditorTarget: 'box',
      backingSuggestions: [],
      removedSuggestions: [],
      templates: CONFIG.templates,
      message: '',
      messages: [],
      oldMessages: [],
      oldMessagesIndex: -1,
      tplBackups: [],
      msgTplBackups: [],
      position: {
        xRatio: 0.015,
        yRatio: 0.05,
        left: 0,
        top: 0,
      },
      layout: {
        scale: 1,
        width: 540,
        windowHeight: 240,
        inputMinHeight: 42,
        gap: 8,
        padding: 10,
      },
      styleDefaults: {
        box: {
          h: 0,
          s: 0,
          v: 7,
          a: 84,
          glow: 0,
        },
        text: {
          h: 0,
          s: 0,
          v: 100,
          a: 100,
          glow: 0,
        },
      },
      styleState: {
        box: {
          h: 0,
          s: 0,
          v: 7,
          a: 84,
          glow: 0,
        },
        text: {
          h: 0,
          s: 0,
          v: 100,
          a: 100,
          glow: 0,
        },
      },
      dragging: false,
      pickerDragging: false,
      dragOffset: {
        x: 0,
        y: 0,
      },
      showWindowTimer: null,
      focusTimer: null,
      styleSaveTimer: null,
      messageListener: null,
      mouseMoveListener: null,
      mouseUpListener: null,
      resizeListener: null,
    };
  },
  destroyed() {
    clearInterval(this.focusTimer);
    clearTimeout(this.showWindowTimer);
    clearTimeout(this.styleSaveTimer);

    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
    }

    if (this.mouseMoveListener) {
      window.removeEventListener('mousemove', this.mouseMoveListener);
    }

    if (this.mouseUpListener) {
      window.removeEventListener('mouseup', this.mouseUpListener);
    }

    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
  },
  mounted() {
    this.updateLayout();
    this.applyStyleVariables(this.styleState);

    this.messageListener = (event) => {
      const item = event.data || event.detail;
      if (item && this[item.type]) {
        this[item.type](item);
      }
    };

    this.mouseMoveListener = (event) => {
      if (this.pickerDragging) {
        this.updateColorFieldFromEvent(event);
      } else {
        this.onDrag(event);
      }
    };

    this.mouseUpListener = () => {
      this.stopDrag();
      this.stopColorFieldDrag();
    };

    this.resizeListener = () => {
      this.updateLayout();
      this.applyPositionFromRatios(this.position.xRatio, this.position.yRatio);
    };

    window.addEventListener('message', this.messageListener);
    window.addEventListener('mousemove', this.mouseMoveListener);
    window.addEventListener('mouseup', this.mouseUpListener);
    window.addEventListener('resize', this.resizeListener);

    this.$nextTick(() => {
      this.applyPositionFromRatios(this.position.xRatio, this.position.yRatio);
      post('http://chat/loaded', JSON.stringify({}));
    });
  },
  watch: {
    messages() {
      if (this.showWindowTimer) {
        clearTimeout(this.showWindowTimer);
      }

      this.showWindow = true;
      this.resetShowWindowTimer();

      const messagesObj = this.$refs.messages;
      if (messagesObj) {
        this.$nextTick(() => {
          messagesObj.scrollTop = messagesObj.scrollHeight;
        });
      }
    },
    showInput() {
      this.$nextTick(() => {
        this.applyPositionFromRatios(this.position.xRatio, this.position.yRatio);
      });
    },
    showStylePanel() {
      this.$nextTick(() => {
        this.applyPositionFromRatios(this.position.xRatio, this.position.yRatio);
      });
    },
  },
  computed: {
    suggestions() {
      return this.backingSuggestions.filter((el) => this.removedSuggestions.indexOf(el.name) <= -1);
    },
    shellStyle() {
      return Object.assign({}, this.baseStyle, {
        left: `${Math.round(this.position.left)}px`,
        top: `${Math.round(this.position.top)}px`,
        width: `${Math.round(this.layout.width)}px`,
        '--chat-scale': this.layout.scale,
        '--chat-window-height': `${Math.round(this.layout.windowHeight)}px`,
        '--chat-input-min-height': `${Math.round(this.layout.inputMinHeight)}px`,
        '--chat-gap': `${Math.round(this.layout.gap)}px`,
      });
    },
    activeStyle() {
      return this.styleState[this.styleEditorTarget] || this.styleState.box;
    },
    activeStyleLabel() {
      return this.styleEditorTarget === 'text' ? 'Chat text color' : 'Chat box color';
    },
    activeStyleDescription() {
      return this.styleEditorTarget === 'text'
        ? 'Pick the color in the square, then tune transparency and glow.'
        : 'Pick the color in the square, then tune transparency and glow.';
    },
    activeStyleRgb() {
      return this.hsvToRgb(this.activeStyle.h, this.activeStyle.s, this.activeStyle.v);
    },
    activeStyleHex() {
      const rgb = this.activeStyleRgb;
      return `#${[rgb.r, rgb.g, rgb.b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    },
    activeStyleSwatchStyle() {
      const rgba = this.colorToRgbaString(this.activeStyle);
      const borderColor = this.styleEditorTarget === 'text'
        ? this.colorToRgbaString({ ...this.activeStyle, a: 100 })
        : rgba;

      return {
        background: this.styleEditorTarget === 'text' ? 'rgba(0, 0, 0, 0.45)' : rgba,
        borderColor,
        color: this.styleEditorTarget === 'text' ? rgba : 'rgba(255,255,255,0.96)',
        boxShadow: this.getGlowShadow(this.activeStyle, this.styleEditorTarget),
        textShadow: this.getTextGlowShadow(this.activeStyle, this.styleEditorTarget),
      };
    },
    colorFieldStyle() {
      return {
        background: `linear-gradient(to top, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0)), linear-gradient(to right, rgba(255, 255, 255, 1), ${this.hueToColor(this.activeStyle.h)})`,
      };
    },
    colorFieldCursorStyle() {
      return {
        left: `${this.activeStyle.s}%`,
        top: `${100 - this.activeStyle.v}%`,
        boxShadow: `0 0 0 2px rgba(255,255,255,0.95), 0 0 0 4px rgba(0,0,0,0.28)`,
      };
    },
    hueSliderStyle() {
      return {
        background: 'linear-gradient(to right, rgb(255, 0, 0) 0%, rgb(255, 255, 0) 16.66%, rgb(0, 255, 0) 33.33%, rgb(0, 255, 255) 50%, rgb(0, 0, 255) 66.66%, rgb(255, 0, 255) 83.33%, rgb(255, 0, 0) 100%)',
      };
    },
    alphaSliderStyle() {
      const rgb = this.activeStyleRgb;
      return {
        background: `linear-gradient(to right, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0), rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1))`,
      };
    },
    glowSliderStyle() {
      const rgb = this.activeStyleRgb;
      return {
        background: `linear-gradient(to right, rgba(255, 255, 255, 0.12), rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1))`,
      };
    },
  },
  methods: {
    clamp(value, minValue, maxValue) {
      return Math.min(Math.max(value, minValue), maxValue);
    },
    clampInt(value, minValue, maxValue) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return minValue;
      }

      return Math.round(this.clamp(numeric, minValue, maxValue));
    },
    getViewportScale() {
      const baseHeight = 1080;
      const height = Math.max(window.innerHeight || baseHeight, 720);
      const growth = Math.max(0, height - baseHeight) / baseHeight;
      return this.clamp(1 + (growth * 0.55), 1, 1.55);
    },
    updateLayout() {
      const scale = this.getViewportScale();
      const maxWidth = Math.max(420, Math.floor(window.innerWidth * 0.48));

      this.layout.scale = scale;
      this.layout.width = this.clamp(Math.round(620 * scale), 460, maxWidth);
      this.layout.windowHeight = Math.round(240 * scale);
      this.layout.inputMinHeight = Math.round(44 * scale);
      this.layout.gap = Math.max(8, Math.round(8 * scale));
      this.layout.padding = Math.max(8, Math.round(10 * scale));

      document.documentElement.style.setProperty('--chat-scale', this.layout.scale);
    },
    getShellHeight() {
      const shell = this.$refs.chatShell;

      if (shell) {
        return shell.getBoundingClientRect().height;
      }

      return this.layout.windowHeight + (this.showInput ? (this.layout.inputMinHeight + (this.layout.gap * 5)) : 0);
    },
    getPositionBounds() {
      const padding = this.layout.padding;
      const width = this.layout.width;
      const height = this.getShellHeight();

      return {
        minLeft: padding,
        minTop: padding,
        maxLeft: Math.max(padding, window.innerWidth - width - padding),
        maxTop: Math.max(padding, window.innerHeight - height - padding),
      };
    },
    setPosition(left, top, shouldPersist = false) {
      const bounds = this.getPositionBounds();
      const clampedLeft = this.clamp(left, bounds.minLeft, bounds.maxLeft);
      const clampedTop = this.clamp(top, bounds.minTop, bounds.maxTop);

      this.position.left = clampedLeft;
      this.position.top = clampedTop;
      this.position.xRatio = window.innerWidth > 0 ? (clampedLeft / window.innerWidth) : 0;
      this.position.yRatio = window.innerHeight > 0 ? (clampedTop / window.innerHeight) : 0;

      if (shouldPersist) {
        this.persistPosition();
      }
    },
    applyPositionFromRatios(xRatio, yRatio, shouldPersist = false) {
      this.$nextTick(() => {
        const ratioX = Number.isFinite(xRatio) ? xRatio : 0.015;
        const ratioY = Number.isFinite(yRatio) ? yRatio : 0.05;
        this.setPosition(window.innerWidth * ratioX, window.innerHeight * ratioY, shouldPersist);
      });
    },
    persistPosition() {
      post('http://chat/chatPositionSave', JSON.stringify({
        xRatio: Number(this.position.xRatio.toFixed(6)),
        yRatio: Number(this.position.yRatio.toFixed(6)),
      }));
    },
    rgbToHsv(r, g, b) {
      const red = this.clamp(r, 0, 255) / 255;
      const green = this.clamp(g, 0, 255) / 255;
      const blue = this.clamp(b, 0, 255) / 255;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const delta = max - min;
      let h = 0;

      if (delta > 0) {
        if (max === red) {
          h = 60 * (((green - blue) / delta) % 6);
        } else if (max === green) {
          h = 60 * (((blue - red) / delta) + 2);
        } else {
          h = 60 * (((red - green) / delta) + 4);
        }
      }

      if (h < 0) {
        h += 360;
      }

      const s = max === 0 ? 0 : (delta / max);
      const v = max;

      return {
        h: Math.round(h),
        s: Math.round(s * 100),
        v: Math.round(v * 100),
      };
    },
    hsvToRgb(h, s, v) {
      const hue = ((Number(h) % 360) + 360) % 360;
      const saturation = this.clamp(Number(s), 0, 100) / 100;
      const value = this.clamp(Number(v), 0, 100) / 100;
      const chroma = value * saturation;
      const hueSection = hue / 60;
      const x = chroma * (1 - Math.abs((hueSection % 2) - 1));
      const m = value - chroma;
      let red = 0;
      let green = 0;
      let blue = 0;

      if (hueSection >= 0 && hueSection < 1) {
        red = chroma;
        green = x;
      } else if (hueSection >= 1 && hueSection < 2) {
        red = x;
        green = chroma;
      } else if (hueSection >= 2 && hueSection < 3) {
        green = chroma;
        blue = x;
      } else if (hueSection >= 3 && hueSection < 4) {
        green = x;
        blue = chroma;
      } else if (hueSection >= 4 && hueSection < 5) {
        red = x;
        blue = chroma;
      } else {
        red = chroma;
        blue = x;
      }

      return {
        r: Math.round((red + m) * 255),
        g: Math.round((green + m) * 255),
        b: Math.round((blue + m) * 255),
      };
    },
    normalizeStyleEntry(entry, fallback) {
      const source = entry || {};
      let normalized = {
        h: this.clampInt(source.h != null ? source.h : fallback.h, 0, 360),
        s: this.clampInt(source.s != null ? source.s : fallback.s, 0, 100),
        v: this.clampInt(source.v != null ? source.v : fallback.v, 0, 100),
        a: this.clampInt(source.a != null ? source.a : fallback.a, 0, 100),
        glow: this.clampInt(source.glow != null ? source.glow : fallback.glow, 0, 100),
      };

      if (source.r != null || source.g != null || source.b != null) {
        const hsv = this.rgbToHsv(
          Number(source.r != null ? source.r : 255),
          Number(source.g != null ? source.g : 255),
          Number(source.b != null ? source.b : 255),
        );

        normalized.h = hsv.h;
        normalized.s = hsv.s;
        normalized.v = hsv.v;
        normalized.a = this.clampInt(source.a != null ? Number(source.a) * 100 : fallback.a, 0, 100);
        normalized.glow = this.clampInt(source.glow != null ? source.glow : fallback.glow, 0, 100);
      }

      return normalized;
    },
    normalizeStyle(style) {
      const incoming = style || {};

      return {
        box: this.normalizeStyleEntry(incoming.box, this.styleDefaults.box),
        text: this.normalizeStyleEntry(incoming.text, this.styleDefaults.text),
      };
    },
    getStylePayload() {
      return {
        box: { ...this.styleState.box },
        text: { ...this.styleState.text },
      };
    },
    colorToRgbaString(color, alphaOverride = null) {
      const rgb = this.hsvToRgb(color.h, color.s, color.v);
      const alpha = alphaOverride == null ? (this.clamp(color.a, 0, 100) / 100) : alphaOverride;
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(3)})`;
    },
    hueToColor(hue) {
      const rgb = this.hsvToRgb(hue, 100, 100);
      return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    },
    getGlowShadow(color, target) {
      if (!color || color.glow <= 0) {
        return 'none';
      }

      const rgb = this.hsvToRgb(color.h, color.s, color.v);
      const blur = target === 'text' ? Math.round(color.glow * 0.18) : Math.round(10 + (color.glow * 0.55));
      const alpha = target === 'text' ? Math.min(0.85, 0.12 + (color.glow / 180)) : Math.min(0.7, 0.08 + (color.glow / 175));
      return `0 0 ${blur}px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(3)})`;
    },
    getTextGlowShadow(color, target) {
      if (target !== 'text' || !color || color.glow <= 0) {
        return 'none';
      }

      const rgb = this.hsvToRgb(color.h, color.s, color.v);
      const blur = Math.round(2 + (color.glow * 0.22));
      const alpha = Math.min(0.9, 0.12 + (color.glow / 170));
      return `0 0 ${blur}px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(3)})`;
    },
    applyStyleVariables(style) {
      const root = document.documentElement;
      const box = style.box;
      const text = style.text;
      const boxRgb = this.hsvToRgb(box.h, box.s, box.v);
      const textRgb = this.hsvToRgb(text.h, text.s, text.v);
      const boxAlpha = box.a / 100;
      const textAlpha = text.a / 100;
      const boxStrongAlpha = this.clamp(boxAlpha + 0.12, 0, 1);
      const boxSoftAlpha = this.clamp(Math.max(0.16, boxAlpha * 0.72), 0, 1);
      const borderAlpha = this.clamp(Math.max(0.12, boxAlpha * 0.58), 0, 1);
      const textSoftAlpha = this.clamp(Math.max(0.54, textAlpha * 0.78), 0, 1);
      const textMutedAlpha = this.clamp(Math.max(0.34, textAlpha * 0.58), 0, 1);
      const boxGlowShadow = this.getGlowShadow(box, 'box');
      const textGlowShadow = this.getTextGlowShadow(text, 'text');

      root.style.setProperty('--chat-box-color', `rgba(${boxRgb.r}, ${boxRgb.g}, ${boxRgb.b}, ${boxAlpha.toFixed(3)})`);
      root.style.setProperty('--chat-box-color-strong', `rgba(${boxRgb.r}, ${boxRgb.g}, ${boxRgb.b}, ${boxStrongAlpha.toFixed(3)})`);
      root.style.setProperty('--chat-box-color-soft', `rgba(${boxRgb.r}, ${boxRgb.g}, ${boxRgb.b}, ${boxSoftAlpha.toFixed(3)})`);
      root.style.setProperty('--chat-border-color', `rgba(${boxRgb.r}, ${boxRgb.g}, ${boxRgb.b}, ${borderAlpha.toFixed(3)})`);
      root.style.setProperty('--chat-box-glow', boxGlowShadow);
      root.style.setProperty('--chat-text-color', `rgba(${textRgb.r}, ${textRgb.g}, ${textRgb.b}, ${textAlpha.toFixed(3)})`);
      root.style.setProperty('--chat-text-soft', `rgba(${textRgb.r}, ${textRgb.g}, ${textRgb.b}, ${textSoftAlpha.toFixed(3)})`);
      root.style.setProperty('--chat-text-muted', `rgba(${textRgb.r}, ${textRgb.g}, ${textRgb.b}, ${textMutedAlpha.toFixed(3)})`);
      root.style.setProperty('--chat-text-glow', textGlowShadow);
    },
    scheduleStyleSave() {
      clearTimeout(this.styleSaveTimer);
      this.styleSaveTimer = setTimeout(() => {
        this.persistStyle();
      }, 120);
    },
    persistStyle() {
      post('http://chat/chatStyleSave', JSON.stringify({
        style: this.getStylePayload(),
      }));
    },
    notifyStyleChanged() {
      this.applyStyleVariables(this.styleState);
      this.scheduleStyleSave();
      this.showWindow = true;
      this.clearShowWindowTimer();
    },
    openStylePanel(target) {
      if (!this.showInput) {
        return;
      }

      this.styleEditorTarget = target;
      this.showStylePanel = true;
      this.showWindow = true;
      this.clearShowWindowTimer();
    },
    closeStylePanel() {
      this.showStylePanel = false;
      this.persistStyle();
      this.resetShowWindowTimer();
    },
    resetActiveStyle() {
      const fallback = this.styleDefaults[this.styleEditorTarget];
      this.$set(this.styleState, this.styleEditorTarget, { ...fallback });
      this.notifyStyleChanged();
    },
    setActiveHue(value) {
      this.activeStyle.h = this.clampInt(value, 0, 360);
      this.notifyStyleChanged();
    },
    setActiveAlpha(value) {
      this.activeStyle.a = this.clampInt(value, 0, 100);
      this.notifyStyleChanged();
    },
    setActiveGlow(value) {
      this.activeStyle.glow = this.clampInt(value, 0, 100);
      this.notifyStyleChanged();
    },
    startColorFieldDrag(event) {
      this.pickerDragging = true;
      this.updateColorFieldFromEvent(event);
      document.body.classList.add('dragging-chat');
      event.preventDefault();
    },
    stopColorFieldDrag() {
      if (!this.pickerDragging) {
        return;
      }

      this.pickerDragging = false;
      document.body.classList.remove('dragging-chat');
      this.persistStyle();
    },
    updateColorFieldFromEvent(event) {
      const field = this.$refs.colorField;
      if (!field) {
        return;
      }

      const rect = field.getBoundingClientRect();
      const x = this.clamp(event.clientX - rect.left, 0, rect.width);
      const y = this.clamp(event.clientY - rect.top, 0, rect.height);
      this.activeStyle.s = this.clampInt((x / Math.max(rect.width, 1)) * 100, 0, 100);
      this.activeStyle.v = this.clampInt(100 - ((y / Math.max(rect.height, 1)) * 100), 0, 100);
      this.notifyStyleChanged();
    },
    ON_STYLE_LOAD({ style }) {
      this.styleState = this.normalizeStyle(style);
      this.applyStyleVariables(this.styleState);
    },
    ON_SCREEN_STATE_CHANGE({ shouldHide }) {
      this.shouldHide = shouldHide;
    },
    ON_POSITION_LOAD({ position }) {
      const xRatio = position && Number.isFinite(position.xRatio) ? position.xRatio : 0.015;
      const yRatio = position && Number.isFinite(position.yRatio) ? position.yRatio : 0.05;

      this.position.xRatio = xRatio;
      this.position.yRatio = yRatio;
      this.applyPositionFromRatios(xRatio, yRatio);
    },
    ON_OPEN() {
      this.showInput = true;
      this.showWindow = true;

      if (this.showWindowTimer) {
        clearTimeout(this.showWindowTimer);
      }

      this.$nextTick(() => {
        this.resize();
        this.applyPositionFromRatios(this.position.xRatio, this.position.yRatio);
      });

      this.focusTimer = setInterval(() => {
        if (this.$refs.input) {
          this.$refs.input.focus();
        } else {
          clearInterval(this.focusTimer);
        }
      }, 100);
    },
    ON_MESSAGE({ message }) {
      this.messages.push(message);
    },
    ON_CLEAR({ resetPosition, position }) {
      this.messages = [];
      this.oldMessages = [];
      this.oldMessagesIndex = -1;

      if (resetPosition) {
        const xRatio = position && Number.isFinite(position.xRatio) ? position.xRatio : 0.015;
        const yRatio = position && Number.isFinite(position.yRatio) ? position.yRatio : 0.05;

        this.position.xRatio = xRatio;
        this.position.yRatio = yRatio;
        this.applyPositionFromRatios(xRatio, yRatio);
      }
    },
    ON_SUGGESTION_ADD({ suggestion }) {
      const duplicateSuggestion = this.backingSuggestions.find((entry) => entry.name === suggestion.name);
      if (duplicateSuggestion) {
        if (suggestion.help || suggestion.params) {
          duplicateSuggestion.help = suggestion.help || '';
          duplicateSuggestion.params = suggestion.params || [];
        }
        return;
      }

      if (!suggestion.params) {
        suggestion.params = [];
      }

      const removedIndex = this.removedSuggestions.indexOf(suggestion.name);
      if (removedIndex !== -1) {
        this.removedSuggestions.splice(removedIndex, 1);
      }

      this.backingSuggestions.push(suggestion);
    },
    ON_SUGGESTION_REMOVE({ name }) {
      if (this.removedSuggestions.indexOf(name) === -1) {
        this.removedSuggestions.push(name);
      }
    },
    ON_COMMANDS_RESET() {
      this.removedSuggestions = [];
      this.backingSuggestions = [];
    },
    ON_TEMPLATE_ADD({ template }) {
      if (this.templates[template.id]) {
        this.warn(`Tried to add duplicate template '${template.id}'`);
      } else {
        this.templates[template.id] = template.html;
      }
    },
    ON_UPDATE_THEMES({ themes }) {
      this.removeThemes();
      this.setThemes(themes);
    },
    removeThemes() {
      for (let i = document.styleSheets.length - 1; i >= 0; i -= 1) {
        const styleSheet = document.styleSheets[i];
        const node = styleSheet.ownerNode;

        if (node && node.getAttribute && node.getAttribute('data-theme')) {
          node.parentNode.removeChild(node);
        }
      }

      this.tplBackups.reverse();
      for (const [elem, oldData] of this.tplBackups) {
        elem.innerText = oldData;
      }
      this.tplBackups = [];

      this.msgTplBackups.reverse();
      for (const [id, oldData] of this.msgTplBackups) {
        this.templates[id] = oldData;
      }
      this.msgTplBackups = [];
    },
    setThemes(themes) {
      for (const [id, data] of Object.entries(themes)) {
        if (data.style) {
          const style = document.createElement('style');
          style.type = 'text/css';
          style.setAttribute('data-theme', id);
          style.appendChild(document.createTextNode(data.style));
          document.head.appendChild(style);
        }

        if (data.styleSheet) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.type = 'text/css';
          link.href = data.baseUrl + data.styleSheet;
          link.setAttribute('data-theme', id);
          document.head.appendChild(link);
        }

        if (data.templates) {
          for (const [tplId, tpl] of Object.entries(data.templates)) {
            const elem = document.getElementById(tplId);
            if (elem) {
              this.tplBackups.push([elem, elem.innerText]);
              elem.innerText = tpl;
            }
          }
        }

        if (data.script) {
          const script = document.createElement('script');
          script.type = 'text/javascript';
          script.src = data.baseUrl + data.script;
          document.head.appendChild(script);
        }

        if (data.msgTemplates) {
          for (const [tplId, tpl] of Object.entries(data.msgTemplates)) {
            this.msgTplBackups.push([tplId, this.templates[tplId]]);
            this.templates[tplId] = tpl;
          }
        }
      }
    },
    warn(msg) {
      this.messages.push({
        args: [msg],
        template: '^3<b>CHAT-WARN</b>: ^0{0}',
      });
    },
    clearShowWindowTimer() {
      clearTimeout(this.showWindowTimer);
    },
    resetShowWindowTimer() {
      this.clearShowWindowTimer();
      this.showWindowTimer = setTimeout(() => {
        if (!this.showInput && !this.showStylePanel) {
          this.showWindow = false;
        }
      }, CONFIG.fadeTimeout);
    },
    keyUp() {
      this.resize();
    },
    keyDown(e) {
      if (e.which === 38 || e.which === 40) {
        e.preventDefault();
        this.moveOldMessageIndex(e.which === 38);
      } else if (e.which === 33) {
        const buffer = this.$refs.messages;
        if (buffer) {
          buffer.scrollTop -= 100;
        }
      } else if (e.which === 34) {
        const buffer = this.$refs.messages;
        if (buffer) {
          buffer.scrollTop += 100;
        }
      }
    },
    moveOldMessageIndex(up) {
      if (up && this.oldMessages.length > this.oldMessagesIndex + 1) {
        this.oldMessagesIndex += 1;
        this.message = this.oldMessages[this.oldMessagesIndex];
      } else if (!up && this.oldMessagesIndex - 1 >= 0) {
        this.oldMessagesIndex -= 1;
        this.message = this.oldMessages[this.oldMessagesIndex];
      } else if (!up && this.oldMessagesIndex - 1 === -1) {
        this.oldMessagesIndex = -1;
        this.message = '';
      }
    },
    resize() {
      const input = this.$refs.input;
      if (!input) {
        return;
      }

      input.style.height = '5px';
      input.style.height = `${Math.max(input.scrollHeight + 2, this.layout.inputMinHeight)}px`;
    },
    startDrag(event) {
      if (!this.showInput) {
        return;
      }

      this.dragging = true;
      this.dragOffset.x = event.clientX - this.position.left;
      this.dragOffset.y = event.clientY - this.position.top;
      document.body.classList.add('dragging-chat');
      event.preventDefault();
    },
    onDrag(event) {
      if (!this.dragging) {
        return;
      }

      this.setPosition(event.clientX - this.dragOffset.x, event.clientY - this.dragOffset.y);
    },
    stopDrag() {
      if (!this.dragging) {
        return;
      }

      this.dragging = false;
      document.body.classList.remove('dragging-chat');
      this.persistPosition();
    },
    send() {
      if (this.message !== '') {
        post('http://chat/chatResult', JSON.stringify({
          message: this.message,
        }));
        this.oldMessages.unshift(this.message);
        this.oldMessagesIndex = -1;
        this.hideInput();
      } else {
        this.hideInput(true);
      }
    },
    hideInput(canceled = false) {
      if (canceled) {
        post('http://chat/chatResult', JSON.stringify({ canceled }));
      }

      this.dragging = false;
      this.pickerDragging = false;
      document.body.classList.remove('dragging-chat');
      this.message = '';
      this.showInput = false;
      this.showStylePanel = false;
      clearInterval(this.focusTimer);
      this.resetShowWindowTimer();
      this.persistStyle();
    },
  },
};

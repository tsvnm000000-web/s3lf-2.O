const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const path = require('path');

const STORAGE_PATH = path.join(__dirname, '..', 'config', 'storage.json');

class SelfbotManager {
  constructor(io) {
    this.io = io;
    this.accounts = new Map(); // id -> { client, token, alias, vcConfig }
    this.onUpdate = null;
    this._loadFromDisk();
  }

  // ── PERSISTENCE ──────────────────────────────────────────────
  _saveToDisk() {
    const data = [];
    for (const [id, acc] of this.accounts) {
      data.push({
        id,
        token: acc.token,
        alias: acc.alias,
        vcConfig: acc.vcConfig || null
      });
    }
    fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(data, null, 2));
  }

  _loadFromDisk() {
    try {
      if (fs.existsSync(STORAGE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
        for (const item of data) {
          this._initAccount(item.id, item.token, item.alias, item.vcConfig);
        }
      }
    } catch (err) {
      console.error('Failed to load storage:', err.message);
    }
  }

  // ── TOKEN MANAGEMENT ─────────────────────────────────────────
  async addToken(token, alias = '') {
    const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const client = new Client({ checkUpdate: false });

    try {
      await client.login(token);
    } catch (err) {
      throw new Error(`Login failed: ${err.message}. Token may be invalid or expired.`);
    }

    const acc = {
      id,
      token,
      alias: alias || `Account ${this.accounts.size + 1}`,
      client,
      vcConfig: null,
      vcKeeper: null
    };

    this.accounts.set(id, acc);
    this._saveToDisk();
    this._emitUpdate();
    return { id, alias: acc.alias, tag: client.user.tag };
  }

  listTokens() {
    const list = [];
    for (const [id, acc] of this.accounts) {
      list.push({
        id,
        alias: acc.alias,
        tag: acc.client.user?.tag || 'Unknown',
        avatar: acc.client.user?.displayAvatarURL() || '',
        status: acc.client.user?.presence?.status || 'offline',
        vcActive: !!acc.vcConfig,
        vcGuild: acc.vcConfig?.guildId || null,
        vcChannel: acc.vcConfig?.channelId || null
      });
    }
    return list;
  }

  // ── EDITING ──────────────────────────────────────────────────
  async updateToken(id, updates) {
    const acc = this.accounts.get(id);
    if (!acc) throw new Error('Account not found.');

    if (updates.alias) acc.alias = updates.alias;

    if (updates.status) {
      const valid = ['online', 'idle', 'dnd', 'offline'];
      if (!valid.includes(updates.status)) throw new Error('Invalid status.');
      await acc.client.user.setPresence({ status: updates.status });
    }

    if (updates.customStatus !== undefined) {
      await acc.client.user.setPresence({
        activities: updates.customStatus
          ? [{ name: 'Custom Status', type: 'CUSTOM', state: updates.customStatus }]
          : []
      });
    }

    if (updates.username) {
      if (!updates.password) throw new Error('Password required to change username.');
      await acc.client.user.setUsername(updates.username, updates.password);
    }

    if (updates.avatarUrl) {
      await acc.client.user.setAvatar(updates.avatarUrl);
    }

    if (updates.bio !== undefined) {
      // Bio editing requires the client.user.edit() method or raw API call
      await acc.client.user.edit({ bio: updates.bio });
    }

    this._saveToDisk();
    this._emitUpdate();
    return { success: true, id };
  }

  // ── BULK EDIT ────────────────────────────────────────────────
  async bulkUpdate(ids, updates) {
    const results = [];
    for (const id of ids) {
      try {
        const r = await this.updateToken(id, updates);
        results.push({ id, ...r });
      } catch (err) {
        results.push({ id, error: err.message });
      }
    }
    return results;
  }

  // ── 24/7 VOICE KEEPER ────────────────────────────────────────
  async toggleVC(id, guildId, channelId) {
    const acc = this.accounts.get(id);
    if (!acc) throw new Error('Account not found.');

    if (acc.vcConfig && acc.vcConfig.guildId === guildId && acc.vcConfig.channelId === channelId) {
      // Turn OFF
      acc.vcConfig = null;
      if (acc.vcKeeper) {
        acc.vcKeeper.stop();
        acc.vcKeeper = null;
      }
      this._saveToDisk();
      this._emitUpdate();
      return { vcActive: false };
    }

    // Turn ON (or switch channel)
    if (acc.vcKeeper) acc.vcKeeper.stop();

    const { VCKeeper } = require('./vcKeeper');
    acc.vcConfig = { guildId, channelId };
    acc.vcKeeper = new VCKeeper(acc.client, guildId, channelId);
    await acc.vcKeeper.start();

    this._saveToDisk();
    this._emitUpdate();
    return { vcActive: true, guildId, channelId };
  }

  // ── REMOVE ───────────────────────────────────────────────────
  async removeToken(id) {
    const acc = this.accounts.get(id);
    if (!acc) return;
    if (acc.vcKeeper) acc.vcKeeper.stop();
    acc.client.destroy();
    this.accounts.delete(id);
    this._saveToDisk();
    this._emitUpdate();
  }

  _emitUpdate() {
    if (this.onUpdate) this.onUpdate(this.listTokens());
  }
}

module.exports = { SelfbotManager };

class VCKeeper {
  constructor(client, guildId, channelId) {
    this.client = client;
    this.guildId = guildId;
    this.channelId = channelId;
    this.interval = null;
    this.running = false;
  }

  async start() {
    this.running = true;
    await this._join();
    // Re-check every 30 seconds (auto-reconnect if kicked)
    this.interval = setInterval(() => this._join(), 30_000);
  }

  async _join() {
    if (!this.running) return;
    try {
      const guild = this.client.guilds.cache.get(this.guildId);
      if (!guild) throw new Error('Guild not found. Is the account in that server?');

      const channel = guild.channels.cache.get(this.channelId);
      if (!channel || !channel.isVoice()) {
        throw new Error('Voice channel not found or not a voice channel.');
      }

      if (this.client.voice?.channelId === this.channelId) return;

      await this.client.voice.joinChannel(channel, {
        selfMute: true,
        selfDeaf: true
      });
      console.log(`[VC] Joined ${channel.name} in ${guild.name}`);
    } catch (err) {
      console.error('[VC] Join failed:', err.message);
    }
  }

  stop() {
    this.running = false;
    if (this.interval) clearInterval(this.interval);
    try {
      if (this.client.voice) this.client.voice.disconnect();
    } catch (_) {}
  }
}

module.exports = { VCKeeper };

const mongoose = require("mongoose");

const dbCache = new Map(), dbSaveQueue = new Map();

const guildObject = {
  guildid: "", // the guild ID
  prefix: "", // the prefix
  category: "", // the category of all of this
  hostingChannel: "", // the hosting channel ID
  newGameVoiceChannel: "", // the "New Game"-voice channel
};

const guildSchema = mongoose.Schema(JSON.parse(JSON.stringify(guildObject)), { minimize: true }); // make a copy of guildObject
const Guild = mongoose.model("Guild", guildSchema);

const get = (guildid) => new Promise((resolve, reject) => Guild.findOne({ guildid }, (err, guild) => {
  if (err) return reject(err);
  if (!guild) {
    guild = new Guild(JSON.parse(JSON.stringify(guildObject)));
    guild.guildid = guildid;
  }
  return resolve(guild);
}));

const load = async (guildid) => {
  let guild = await get(guildid), guildCache = {}, freshGuildObject = JSON.parse(JSON.stringify(guildObject)); // make a fresh one, to not make duplicates across guilds (for example on arrays and objects)
  for (const key in freshGuildObject) guildCache[key] = guild[key] || freshGuildObject[key]; // if there's no value stored in the guild database then we use the default value
  return dbCache.set(guildid, guildCache);
};

const save = async (guildid, changes) => {
  if (!dbSaveQueue.has(guildid)) {
    dbSaveQueue.set(guildid, changes);
    let guild = await get(guildid), guildCache = dbCache.get(guildid), guildSaveQueue = JSON.parse(JSON.stringify(dbSaveQueue.get(guildid)));
    for (const key of guildSaveQueue) guild[key] = guildCache[key];
    return guild.save().then(() => {
      let newSaveQueue = dbSaveQueue.get(guildid);
      if (newSaveQueue.length > guildSaveQueue.length) {
        dbSaveQueue.delete(guildid);
        save(guildid, newSaveQueue.filter(key => !guildSaveQueue.includes(key)));
      } else dbSaveQueue.delete(guildid);
    }).catch(console.log);
  } else dbSaveQueue.get(guildid).push(...changes);
};

module.exports = async guildid => {
  if (!dbCache.has(guildid)) await load(guildid); // if the guild is unloaded for some reason, we load it
  return {

    // debugging
    reload: () => load(guildid),
    unload: () => dbCache.delete(guildid),

    // general access and modifications
    get: () => Object.assign({}, dbCache.get(guildid)),
    set: (key, value) => {
      dbCache.get(guildid)[key] = value;
      save(guildid, [ key ]);
    },
    setMultiple: (changes) => {
      let guildCache = dbCache.get(guildid);
      Object.assign(guildCache, changes);

      save(guildid, Object.keys(changes));
    },
    reset: () => {
      let guildCache = dbCache.get(guildid);
      Object.assign(guildCache, JSON.parse(JSON.stringify(guildObject)));
      guildCache.guildid = guildid;

      save(guildid, Object.keys(guildObject));
    }
  };
};

module.exports.cacheAll = async (guilds = new Set()) => {
  let gdbs = await Guild.find({ $or: [...guilds].map(guildid => ({ guildid })) });
  return await Promise.all([...guilds].map(async guildid => {
    let
      guild = gdbs.find(db => db.guildid == guildid) || { guildid },
      guildCache = {},
      freshGuildObject = JSON.parse(JSON.stringify(guildObject)); // make a fresh one, to not make duplicates across guilds (for example on arrays and objects)
    for (const key in freshGuildObject) guildCache[key] = guild[key] || freshGuildObject[key]; // if there's no value stored in the guild database then we use the default value
    return dbCache.set(guildid, guildCache);
  }));
};
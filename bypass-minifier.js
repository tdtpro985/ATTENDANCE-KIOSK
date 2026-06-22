module.exports = async ({ code, map }) => {
  return { code, map: map || null };
};

function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  generateRandomBlockRange: (userContext, _events, done) => {
    const MAX_HEIGHT = 5000;
    const from = getRandomNumber(0, MAX_HEIGHT);
    const to = getRandomNumber(0, MAX_HEIGHT);

    // If from is greater than to, we assign undefined to both variables.
    // Doing so, lets us test the GraphQL resolver with undefined variables (which means get all blocks).
    if (from > to) {
      userContext.vars.to = undefined;
      userContext.vars.from = undefined;
    } else {
      userContext.vars.to = to;
      userContext.vars.from = from;
    }
    return done();
  },
};

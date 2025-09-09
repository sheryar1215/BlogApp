const Parse = require('parse/node');
const crypto = require('crypto');

class PasswordResetToken extends Parse.Object {
  constructor() {
    super('PasswordResetToken');
  }

  static async createToken(userId) {
    const token = new PasswordResetToken();
    token.set('userId', userId);
    token.set('token', crypto.randomBytes(32).toString('hex'));
    token.set('expiresAt', new Date(Date.now() + 3600000)); 
    token.set('used', false);
    
    await token.save(null, { useMasterKey: true });
    return token;
  }

  static async findByToken(tokenString) {
    const query = new Parse.Query(PasswordResetToken);
    query.equalTo('token', tokenString);
    query.greaterThan('expiresAt', new Date());
    query.equalTo('used', false);
    return query.first({ useMasterKey: true });
  }
}

Parse.Object.registerSubclass('PasswordResetToken', PasswordResetToken);

module.exports = PasswordResetToken;
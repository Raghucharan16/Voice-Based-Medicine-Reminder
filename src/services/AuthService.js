import AsyncStorage from '@react-native-async-storage/async-storage';

class AuthService {
  static USER_KEY = 'user_data';

  static async register(username, password) {
    try {
      const existingUser = await this.getUser(username);
      if (existingUser) {
        throw new Error('Username already exists');
      }
      const user = { username, password };
      await AsyncStorage.setItem(`${this.USER_KEY}:${username}`, JSON.stringify(user));
      return user;
    } catch (error) {
      console.error('Error during registration:', error);
      throw error;
    }
  }

  static async login(username, password) {
    try {
      const user = await this.getUser(username);
      if (user && user.password === password) {
        return user;
      }
      throw new Error('Invalid username or password');
    } catch (error) {
      console.error('Error during login:', error);
      throw error;
    }
  }

  static async getUser(username) {
    try {
      const userData = await AsyncStorage.getItem(`${this.USER_KEY}:${username}`);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  static async logout() {
    // In a real app, this would clear the active session/token
    console.log('User logged out');
  }
}

export default AuthService;

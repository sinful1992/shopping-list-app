/**
 * @format
 */

// IMPORTANT: This must be imported first to polyfill URL for Supabase
import 'react-native-url-polyfill/auto';

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);

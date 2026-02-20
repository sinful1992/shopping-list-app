/**
 * @format
 */

import 'react-native-gesture-handler';
// URL polyfill — must be imported before Supabase service files (which load in App.tsx)
import 'react-native-url-polyfill/auto';

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);

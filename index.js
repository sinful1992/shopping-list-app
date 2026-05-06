/**
 * @format
 */

import 'react-native-gesture-handler';
// CSPRNG polyfill — must be first so crypto.getRandomValues() is available for uuid and invitation code generation
import 'react-native-get-random-values';
// URL polyfill — must be imported before Supabase service files (which load in App.tsx)
import 'react-native-url-polyfill/auto';

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);

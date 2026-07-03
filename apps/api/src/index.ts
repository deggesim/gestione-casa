import { buildApp } from './app';
import { env } from './env';

buildApp().listen(env.PORT);
console.log(`API listening on port ${env.PORT}`);

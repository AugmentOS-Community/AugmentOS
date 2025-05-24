// Reexport the native module. On web, it will be resolved to AugmodModule.web.ts
// and on native platforms to AugmodModule.ts
export { default } from './AugmodModule';
export { default as AugmodView } from './AugmodView';
export * from  './Augmod.types';

// One file per language, loaded only when this language is used (see loadLocale in ./index.js).
export default import.meta.glob('./en/*.js', { eager: true, import: 'default' });

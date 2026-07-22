# better-profane-words

A comprehensive list of 2700+ profane words with **category** and **intensity** classifications, ready for content moderation and filtering.

Built on top of [profane-words](https://github.com/zautumnz/profane-words).

## Install

```bash
npm install better-profane-words
```

## Usage

```js
const profanity = require('better-profane-words');
```

### Check if a word is profane

```js
profanity.isProfane('fuck');        // true
profanity.isProfane('hello');       // false
```

### Look up a word

```js
profanity.lookup('shit');
// { word: 'shit', categories: ['bodily'], intensity: 3 }

profanity.lookup('ni**er');
// { word: 'ni**er', categories: ['slur_racial'], intensity: 5 }
// i censored this to avoid getting cancelled
```

### Filter text

```js
profanity.filterText('what the fuck is this shit');
// { clean: 'what the *** is this ***', matched: [...] }

profanity.filterText('holy damn', { replacement: '[censored]', minIntensity: 2 });
// { clean: 'holy [censored]', matched: [...] }
```

### Check if text contains profanity

```js
profanity.containsProfanity('this is fine');         // false
profanity.containsProfanity('what the hell');        // true

profanity.containsProfanity('damn it', { minIntensity: 3 });  // false (damn = intensity 1)
```

### Get words by category

```js
profanity.getByCategory('slur_racial');   // all racial slurs
profanity.getByCategory('drug');          // all drug references
```

### Get words by intensity

```js
profanity.getByIntensity(5);       // intensity exactly 5
profanity.getByIntensity(3, 5);    // intensity 3 through 5
```

### Get all categories

```js
profanity.getCategories();
// ['bodily', 'drug', 'hateful_ideology', 'insult', 'religious', 'sexual', 'slur_gender', 'slur_racial', 'violence']
```

## Categories

| Category | Description |
|---|---|
| `sexual` | Sex acts, sexual anatomy, pornography |
| `bodily` | Bodily functions and anatomy |
| `insult` | General insults and name-calling |
| `slur_racial` | Racial and ethnic slurs |
| `slur_gender` | Homophobic, transphobic, and sexist slurs |
| `religious` | Religious profanity |
| `hateful_ideology` | Nazi, KKK, white supremacy references |
| `drug` | Drug references |
| `violence` | Violence and harm references |

Words can belong to multiple categories.

## Intensity Scale

| Level | Description | Examples |
|---|---|---|
| 1 | Mild | crap, damn, ass |
| 2 | Moderate | bastard, piss, douche |
| 3 | Strong | fuck, shit, bitch, cock |
| 4 | Very strong | cunt, motherfucker, rape |
| 5 | Extremely offensive | Slurs, CSAM references |

## License

MIT
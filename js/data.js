/* data.js — built-in starter bank. Lets the app work before an API key is added
   and serves as an offline fallback. Exposed globally as `Data`. */
(function () {
  "use strict";

  var LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

  var SEED = {
    /* EN -> FR production */
    translate: {
      A1: [
        { en: "Hello, how are you?", fr: "Bonjour, comment ça va ?" },
        { en: "I would like a coffee, please.", fr: "Je voudrais un café, s'il vous plaît." },
        { en: "Where is the train station?", fr: "Où est la gare ?" },
        { en: "My name is Paul.", fr: "Je m'appelle Paul." },
        { en: "I don't understand.", fr: "Je ne comprends pas." },
        { en: "How much does it cost?", fr: "Combien ça coûte ?" }
      ],
      A2: [
        { en: "Yesterday I went to the market.", fr: "Hier, je suis allé au marché." },
        { en: "Can you help me, please?", fr: "Pouvez-vous m'aider, s'il vous plaît ?" },
        { en: "We are going to the cinema tonight.", fr: "Nous allons au cinéma ce soir." },
        { en: "She likes to read books.", fr: "Elle aime lire des livres." },
        { en: "It's too expensive for me.", fr: "C'est trop cher pour moi." }
      ],
      B1: [
        { en: "If I had more time, I would travel more.", fr: "Si j'avais plus de temps, je voyagerais davantage." },
        { en: "I think we should leave earlier.", fr: "Je pense que nous devrions partir plus tôt." },
        { en: "She told me she was tired.", fr: "Elle m'a dit qu'elle était fatiguée." },
        { en: "I'm looking for a job in marketing.", fr: "Je cherche un emploi dans le marketing." },
        { en: "Despite the rain, we went out.", fr: "Malgré la pluie, nous sommes sortis." }
      ],
      B2: [
        { en: "Had I known, I would have acted differently.", fr: "Si j'avais su, j'aurais agi différemment." },
        { en: "It is essential that everyone be present.", fr: "Il est essentiel que tout le monde soit présent." },
        { en: "He behaves as if he knew everything.", fr: "Il se comporte comme s'il savait tout." },
        { en: "The decision was made despite the objections.", fr: "La décision a été prise malgré les objections." }
      ],
      C1: [
        { en: "The report highlights the underlying causes of the crisis.", fr: "Le rapport met en évidence les causes profondes de la crise." },
        { en: "Were it not for your help, I would have failed.", fr: "Sans votre aide, j'aurais échoué." },
        { en: "This calls for a more nuanced approach.", fr: "Cela appelle une approche plus nuancée." }
      ],
      C2: [
        { en: "Notwithstanding the difficulties, the project succeeded.", fr: "En dépit des difficultés, le projet a réussi." },
        { en: "His argument, however compelling, fails to convince me.", fr: "Son argument, aussi convaincant soit-il, ne me convainc pas." }
      ]
    },

    /* flawed sentence -> corrected, with the rule */
    grammar: {
      A1: [
        { prompt: "Je suis allé à le marché.", target: "Je suis allé au marché.", rule: "à + le contracts to « au »." },
        { prompt: "Elle a deux chien.", target: "Elle a deux chiens.", rule: "Plural nouns take an -s." },
        { prompt: "Je mange une pomme rouge grande.", target: "Je mange une grande pomme rouge.", rule: "Size adjectives (grand) go before the noun." }
      ],
      A2: [
        { prompt: "Hier je vais au cinéma.", target: "Hier je suis allé au cinéma.", rule: "A past time marker needs the passé composé." },
        { prompt: "Nous avons allé en France.", target: "Nous sommes allés en France.", rule: "« aller » uses « être » in the passé composé." },
        { prompt: "C'est la livre que je cherche.", target: "C'est le livre que je cherche.", rule: "« livre » (book) is masculine." }
      ],
      B1: [
        { prompt: "Si j'aurai le temps, je viendrai.", target: "Si j'ai le temps, je viendrai.", rule: "After « si » (condition) use the present, not the future." },
        { prompt: "Il faut que je vais.", target: "Il faut que j'aille.", rule: "« il faut que » triggers the subjunctive." },
        { prompt: "Je l'ai écouté tout les jours.", target: "Je l'ai écouté tous les jours.", rule: "« tous » agrees with the masculine plural « les jours »." }
      ],
      B2: [
        { prompt: "Bien qu'il est intelligent, il échoue.", target: "Bien qu'il soit intelligent, il échoue.", rule: "« bien que » takes the subjunctive." },
        { prompt: "Je veux que tu viens.", target: "Je veux que tu viennes.", rule: "« vouloir que » takes the subjunctive." }
      ],
      C1: [
        { prompt: "Quoiqu'il fait froid, nous sortons.", target: "Quoiqu'il fasse froid, nous sortons.", rule: "« quoique » takes the subjunctive." },
        { prompt: "À condition que tu viens, ça ira.", target: "À condition que tu viennes, ça ira.", rule: "« à condition que » takes the subjunctive." }
      ],
      C2: [
        { prompt: "Il se peut qu'il a raison.", target: "Il se peut qu'il ait raison.", rule: "« il se peut que » takes the subjunctive." },
        { prompt: "Quel que soit le problèmes, on s'adapte.", target: "Quels que soient les problèmes, on s'adapte.", rule: "« quel que » agrees with the following noun." }
      ]
    },

    /* sentence to say aloud */
    speak: {
      A1: [
        { fr: "Bonjour ! Comment allez-vous ?", en: "Hello! How are you?" },
        { fr: "Je voudrais un café, s'il vous plaît.", en: "I'd like a coffee, please." },
        { fr: "Merci beaucoup, au revoir !", en: "Thank you very much, goodbye!" }
      ],
      A2: [
        { fr: "Je suis allé au marché ce matin.", en: "I went to the market this morning." },
        { fr: "On se voit demain ?", en: "See you tomorrow?" },
        { fr: "Il fait beau aujourd'hui.", en: "The weather is nice today." }
      ],
      B1: [
        { fr: "Je pense qu'il faut réserver à l'avance.", en: "I think we need to book in advance." },
        { fr: "Pourriez-vous répéter, s'il vous plaît ?", en: "Could you repeat, please?" },
        { fr: "Je ne suis pas sûr d'avoir bien compris.", en: "I'm not sure I understood correctly." }
      ],
      B2: [
        { fr: "À mon avis, cette solution présente plusieurs avantages.", en: "In my opinion, this solution has several advantages." },
        { fr: "Je ne suis pas tout à fait d'accord avec vous.", en: "I don't entirely agree with you." }
      ],
      C1: [
        { fr: "Permettez-moi de nuancer votre propos.", en: "Allow me to qualify your point." },
        { fr: "Cela soulève une question fondamentale.", en: "That raises a fundamental question." }
      ],
      C2: [
        { fr: "En définitive, tout dépend du contexte.", en: "Ultimately, it all depends on the context." },
        { fr: "Je me permets d'émettre quelques réserves.", en: "I'll allow myself to voice a few reservations." }
      ]
    },

    /* build a sentence: EN meaning -> FR target */
    build: {
      A1: [
        { en: "I have a black cat.", target: "J'ai un chat noir." },
        { en: "She is at home.", target: "Elle est à la maison." },
        { en: "We eat bread.", target: "Nous mangeons du pain." }
      ],
      A2: [
        { en: "We ate at the restaurant yesterday.", target: "Nous avons mangé au restaurant hier." },
        { en: "He wants to learn French.", target: "Il veut apprendre le français." },
        { en: "I will call you tomorrow.", target: "Je t'appellerai demain." }
      ],
      B1: [
        { en: "I would like to travel to Italy.", target: "J'aimerais voyager en Italie." },
        { en: "She has been working here for three years.", target: "Elle travaille ici depuis trois ans." },
        { en: "We must leave before noon.", target: "Nous devons partir avant midi." }
      ],
      B2: [
        { en: "It is important to listen to others.", target: "Il est important d'écouter les autres." },
        { en: "Despite the rain, we went out.", target: "Malgré la pluie, nous sommes sortis." }
      ],
      C1: [
        { en: "The economy is recovering slowly.", target: "L'économie se redresse lentement." },
        { en: "This decision will have lasting consequences.", target: "Cette décision aura des conséquences durables." }
      ],
      C2: [
        { en: "This raises a fundamental ethical question.", target: "Cela soulève une question éthique fondamentale." }
      ]
    },

    /* vocab flashcards: EN -> FR */
    flash: {
      A1: [
        { front: "house", back: "la maison" }, { front: "water", back: "l'eau" },
        { front: "to eat", back: "manger" }, { front: "friend", back: "l'ami(e)" },
        { front: "today", back: "aujourd'hui" }, { front: "thank you", back: "merci" }
      ],
      A2: [
        { front: "trip", back: "le voyage" }, { front: "to choose", back: "choisir" },
        { front: "weather", back: "le temps" }, { front: "expensive", back: "cher" },
        { front: "often", back: "souvent" }, { front: "to remember", back: "se souvenir" }
      ],
      B1: [
        { front: "meeting", back: "la réunion" }, { front: "to improve", back: "améliorer" },
        { front: "advice", back: "le conseil" }, { front: "however", back: "cependant" },
        { front: "mistake", back: "l'erreur" }, { front: "to manage", back: "gérer" }
      ],
      B2: [
        { front: "the stakes", back: "les enjeux" }, { front: "to assess", back: "évaluer" },
        { front: "growth", back: "la croissance" }, { front: "nonetheless", back: "néanmoins" },
        { front: "framework", back: "le cadre" }, { front: "to undertake", back: "entreprendre" }
      ],
      C1: [
        { front: "discrepancy", back: "l'écart" }, { front: "to mitigate", back: "atténuer" },
        { front: "oversight", back: "la surveillance" }, { front: "insofar as", back: "dans la mesure où" },
        { front: "to leverage", back: "tirer parti de" }
      ],
      C2: [
        { front: "caveat", back: "la réserve" }, { front: "to embody", back: "incarner" },
        { front: "albeit", back: "quoique" }, { front: "to substantiate", back: "étayer" }
      ]
    }
  };

  function pool(mode, level) {
    var byLevel = SEED[mode] || {};
    if (byLevel[level] && byLevel[level].length) return byLevel[level];
    // fall back to the nearest populated level
    var i = LEVELS.indexOf(level);
    for (var d = 1; d < LEVELS.length; d++) {
      var lo = LEVELS[i - d], hi = LEVELS[i + d];
      if (lo && byLevel[lo] && byLevel[lo].length) return byLevel[lo];
      if (hi && byLevel[hi] && byLevel[hi].length) return byLevel[hi];
    }
    return [];
  }

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  var Data = {
    levels: LEVELS,
    get: function (mode, level) {
      var p = pool(mode, level);
      return p.length ? Object.assign({}, rand(p)) : null;
    },
    batch: function (mode, level, n) {
      var p = pool(mode, level).slice();
      // shuffle
      for (var i = p.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = p[i]; p[i] = p[j]; p[j] = t;
      }
      return p.slice(0, n || p.length).map(function (x) { return Object.assign({}, x); });
    }
  };

  window.Data = Data;
})();

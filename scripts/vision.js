// Analyse d'image côté client avec TensorFlow.js (MobileNet v1, alpha 0.5).
//
// Ce que ça fait réellement : MobileNet est entraîné sur ImageNet (1000 objets
// du quotidien). Il sait dire « personne / vêtement / paysage / capture d'écran »,
// il ne sait pas — et ne saura pas — reconnaître des attributs corporels
// intimes. Ici il sert à étiqueter les vignettes et à écarter celles qui ne sont
// pas des photos (logos, captures, bannières de texte).
//
// TensorFlow.js pèse ~1 Mo : il n'est téléchargé que si l'option est cochée.

const VISION_SCRIPTS = {
  tfjs: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js',
  mobilenet: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js'
};

/** Étiquettes ImageNet typiques d'une image qui n'est pas une photo de personne. */
const NON_PHOTO_LABELS = ['web site', 'website', 'menu', 'envelope', 'book jacket',
  'comic book', 'crossword puzzle', 'digital clock', 'street sign', 'packet',
  'carton', 'binder', 'notebook', 'monitor', 'screen', 'television'];

let visionModel = null;
let visionLoading = null;

/**
 * Charge TensorFlow.js puis MobileNet, une seule fois.
 * @returns {Promise<Object>} - Le modèle chargé.
 */
function ensureVisionModel() {
  if (visionModel) return Promise.resolve(visionModel);
  if (visionLoading) return visionLoading;

  visionLoading = (async () => {
    showNotification("Chargement du modèle d'analyse d'image (~1 Mo)…", 'info');
    await loadScriptOnce(VISION_SCRIPTS.tfjs);
    await loadScriptOnce(VISION_SCRIPTS.mobilenet);

    if (!window.mobilenet) throw new Error('MobileNet indisponible');

    // v1 + alpha 0.5 : ~1,3 Mo de poids, le meilleur compromis sur mobile.
    // (v2 n'existe qu'en alpha 1.0, soit une dizaine de Mo.)
    visionModel = await window.mobilenet.load({ version: 1, alpha: 0.5 });
    showNotification("Modèle d'analyse d'image prêt.", 'success');
    return visionModel;
  })();

  visionLoading.catch(() => { visionLoading = null; });
  return visionLoading;
}

/**
 * Charge une image en autorisant la lecture des pixels (CORS).
 * @param {string} url
 * @param {number} [timeout]
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageForAnalysis(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);

    image.onload = () => {
      clearTimeout(timer);
      if (!image.naturalWidth) reject(new Error('image vide'));
      else resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error('CORS ou image inaccessible'));
    };
    image.src = url;
  });
}

/**
 * Analyse les images des résultats et leur ajoute des étiquettes.
 * @param {Object[]} results
 * @returns {Promise<Object[]>}
 */
async function analyzeResultImages(results) {
  const targets = results.filter(result => result.image && result.type !== 'link');
  if (!targets.length) return results;

  try {
    await ensureVisionModel();
  } catch (error) {
    console.warn('Analyse d\'image indisponible :', error);
    showNotification("Analyse d'image indisponible (modèle non chargé).", 'warning');
    return results;
  }

  let analyzed = 0;
  let skipped = 0;

  await mapWithLimit(targets, 2, async result => {
    try {
      const image = await loadImageForAnalysis(result.image);
      const predictions = await visionModel.classify(image, 3);

      result.labels = predictions
        .filter(prediction => prediction.probability >= 0.08)
        .map(prediction => ({
          name: prediction.className.split(',')[0].trim(),
          score: Math.round(prediction.probability * 100)
        }));

      result.isPhoto = !result.labels.some(label =>
        NON_PHOTO_LABELS.some(term => normalizeText(label.name).includes(term)));
      analyzed++;
    } catch (error) {
      // Image inaccessible en cross-origin : on ne peut pas l'analyser, on la garde.
      result.labels = [];
      result.isPhoto = null;
      skipped++;
    }
  });

  showNotification(`Analyse d'image : ${analyzed} vignette(s) traitée(s)`
    + (skipped ? `, ${skipped} illisible(s).` : '.'), 'info');

  if (filters.vision.hideNonPhoto) {
    return results.filter(result => result.isPhoto !== false);
  }
  return results;
}

window.ensureVisionModel = ensureVisionModel;
window.analyzeResultImages = analyzeResultImages;

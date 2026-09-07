"""Flask API for crop disease prediction and Sri Lankan treatment guidance (Optimized for TFLite)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image, UnidentifiedImageError
# Use the Python 3.12-compatible LiteRT runtime for the .tflite model.
from ai_edge_litert import interpreter as tflite
from werkzeug.exceptions import RequestEntityTooLarge

# H5 Model එක වෙනුවට .tflite model එකේ path එක ලබාදීම
MODEL_PATH = Path(os.getenv("MODEL_PATH", "./crop_disease_model.tflite"))
IMAGE_SIZE = (224, 224)
MAX_UPLOAD_SIZE = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}

CLASS_NAMES = [
    "Bacteria",
    "Chilli __Whitefly",
    "Chilli __Yellowish",
    "Chilli__Anthacnose",
    "Chilli__Leaf_Curl_Virus",
    "Chilli___healthy",
    "Fungi",
    "Healthy",
    "Ill_cucumber",
    "Nematode",
    "Pest",
    "Phytopthora",
    "Virus",
    "_BrownSpot",
    "_Healthy",
    "_Hispa",
    "_LeafBlast",
    "bacterial_spot",
    "early_blight",
    "good_Cucumber",
    "healthy",
    "late_blight",
    "leaf_mold",
    "mosaic_virus",
    "septoria_leaf_spot",
    "single_prediction",
    "target_spot",
    "twospotted_spider_mite",
    "yellow_leaf_curl_virus",
]


def _entry(
    crop: str,
    disease: str,
    symptoms: str,
    organic_treatment: str,
    chemical_treatment: str,
    prevention: str,
) -> dict[str, str]:
    """Create one consistently shaped knowledge-base record."""
    return {
        "crop": crop,
        "disease": disease,
        "symptoms": symptoms,
        "organic_treatment": organic_treatment,
        "chemical_treatment": chemical_treatment,
        "prevention": prevention,
    }


TREATMENT_DB: dict[str, dict[str, str]] = {
    "Bacteria": _entry("General", "Bacterial Disease", "Water-soaked spots that turn brown, with possible ooze on stems or fruit.", "Remove infected tissue and apply a dilute neem or compost-tea spray.", "Copper oxychloride or a copper-based bactericide as per the DOA label.", "Use clean seed, avoid overhead watering, and disinfect tools between plants."),
    "Chilli __Whitefly": _entry("Chilli", "Chilli Whitefly", "Tiny white insects under leaves, sticky honeydew, yellowing, and sooty mould.", "Use neem oil and yellow sticky traps; wash the underside of leaves with water.", "Imidacloprid or another DOA-registered whitefly product as directed.", "Control weeds, use insect-proof nursery netting, and remove heavily infested leaves."),
    "Chilli __Yellowish": _entry("Chilli", "Chilli Yellowing", "Leaves become pale yellow, growth is stunted, and older leaves may drop.", "Improve compost and drainage; apply neem cake and a balanced organic feed.", "Use a DOA-recommended nutrient correction only after ruling out pests and virus.", "Test soil, avoid waterlogging, and inspect plants weekly for vectors."),
    "Chilli__Anthacnose": _entry("Chilli", "Chilli Anthracnose", "Sunken dark lesions on ripe fruit, often with concentric rings and pink spore masses.", "Remove diseased fruit and use Trichoderma viride in soil or a neem-based spray.", "Mancozeb or carbendazim 12% + mancozeb 63% WP according to the DOA label.", "Use healthy seed, provide spacing, avoid fruit wetness, and destroy crop residues."),
    "Chilli__Leaf_Curl_Virus": _entry("Chilli", "Chilli Leaf Curl Virus", "Leaves curl upward, become small and yellow, and plants show severe stunting.", "Remove infected plants; use neem oil and yellow sticky traps to reduce whitefly vectors.", "There is no curative chemical; use a DOA-registered whitefly insecticide to manage the vector.", "Use resistant healthy seedlings, manage weeds, and remove infected plants early."),
    "Chilli___healthy": _entry("Chilli", "Healthy Chilli", "Leaves are green and firm, with normal flowering and unblemished fruit.", "Maintain compost, mulch, and occasional neem oil monitoring spray.", "No chemical treatment is required.", "Use clean seed, balanced irrigation, crop rotation, and regular scouting."),
    "Fungi": _entry("General", "Fungal Disease", "Irregular leaf spots, mould, mildew, or rotting on leaves, stems, and fruit.", "Improve airflow and apply Trichoderma viride or a suitable neem preparation.", "Mancozeb, chlorothalonil, or copper oxychloride as appropriate and label-approved.", "Rotate crops, remove residues, improve drainage, and avoid wet foliage."),
    "Healthy": _entry("General", "Healthy Crop", "Uniform green foliage with normal growth and no visible pest or disease symptoms.", "Use compost, mulch, and neem oil only as a monitored preventive measure.", "No chemical treatment is required.", "Keep the field weed-free, irrigate at the root zone, and scout regularly."),
    "Ill_cucumber": _entry("Cucumber", "Cucumber Disease", "Yellowing or spotted leaves, reduced vigour, and misshapen or scarred fruit.", "Remove affected leaves and apply Trichoderma viride or neem oil where suitable.", "Mancozeb or chlorothalonil according to the DOA crop recommendation.", "Use clean seed, trellis plants, improve airflow, and avoid overhead irrigation."),
    "Nematode": _entry("General", "Root-Knot Nematode", "Plants wilt in heat and roots have characteristic galls, with stunted growth.", "Apply neem cake, compost, and Trichoderma; solarise nursery soil where practical.", "Use only a DOA-approved nematicide and follow its restricted-use label.", "Rotate with non-host crops, use clean planting material, and remove infested roots."),
    "Pest": _entry("General", "Insect Pest Damage", "Chewed leaves, holes, stippling, webbing, or honeydew on leaves and shoots.", "Use neem oil, hand-pick insects, and install yellow or blue sticky traps.", "Use the appropriate DOA-registered insecticide only after identifying the pest.", "Scout twice weekly, conserve beneficial insects, and manage weeds."),
    "Phytopthora": _entry("General", "Phytophthora Blight", "Water-soaked dark lesions, rapid wilting, and soft rot around the crown or fruit.", "Improve drainage and apply Trichoderma to the root zone; remove infected plants.", "Copper oxychloride or a DOA-registered oomycete fungicide as directed.", "Use raised beds, clean water, crop rotation, and avoid moving contaminated soil."),
    "Virus": _entry("General", "Viral Disease", "Mottled or mosaic leaves, curling, vein clearing, and stunted plants.", "Rogue infected plants and use neem oil or sticky traps to suppress insect vectors.", "No curative chemical exists; use a DOA-registered vector-control product when needed.", "Use certified seed, control weeds and vectors, and disinfect hands and tools."),
    "_BrownSpot": _entry("General", "Brown Spot", "Small brown lesions enlarge into circular spots and may cause leaf drop.", "Remove infected leaves and improve airflow; apply Trichoderma to the soil.", "Mancozeb or copper oxychloride as per the DOA label.", "Use crop rotation, clean seed, balanced nutrition, and avoid prolonged leaf wetness."),
    "_Healthy": _entry("General", "Healthy Crop", "Healthy green leaves and normal crop development without visible lesions.", "Maintain organic matter, mulch, and good irrigation practice.", "No chemical treatment is required.", "Use clean planting material, field sanitation, and regular monitoring."),
    "_Hispa": _entry("General", "Leaf Hispa Damage", "Scraped window-like patches and narrow white streaks on leaves caused by beetles.", "Hand-pick adults and use neem oil on the leaf surface.", "Use a DOA-registered insecticide only when infestation exceeds the economic threshold.", "Remove weeds, avoid excess nitrogen, and inspect young foliage frequently."),
    "_LeafBlast": _entry("General", "Leaf Blast", "Spindle-shaped grey or brown lesions with darker margins that coalesce on leaves.", "Improve nutrition and airflow; use Trichoderma and remove badly infected leaves.", "Mancozeb or another DOA-registered fungicide according to the label.", "Use tolerant varieties, avoid excess nitrogen, and rotate crops."),
    "bacterial_spot": _entry("Tomato", "Bacterial Spot", "Small dark water-soaked spots on leaves, stems, and fruit, sometimes with yellow halos.", "Remove affected tissue and apply a neem-based preparation; do not save seed from diseased fruit.", "Copper oxychloride or another DOA-registered copper product as directed.", "Use disease-free seed, avoid overhead irrigation, and sanitise tools."),
    "early_blight": _entry("Tomato", "Early Blight", "Brown target-like rings on lower leaves, yellowing, and dark lesions on stems or fruit shoulders.", "Apply Trichoderma viride to soil and remove lower infected leaves.", "Mancozeb, chlorothalonil, or carbendazim 12% + mancozeb 63% WP per DOA guidance.", "Stake plants, mulch soil, rotate crops, and remove tomato residues."),
    "good_Cucumber": _entry("Cucumber", "Healthy Cucumber", "Green leaves, vigorous vines, and straight fruit without spots or distortion.", "Use compost, mulch, and neem oil only when monitoring indicates a need.", "No chemical treatment is required.", "Trellis vines, irrigate at the root zone, rotate crops, and scout regularly."),
    "healthy": _entry("General", "Healthy Crop", "Normal green foliage and growth with no characteristic disease or pest signs.", "Maintain compost, mulch, and balanced organic nutrition.", "No chemical treatment is required.", "Use clean seed, good drainage, crop rotation, and routine field checks."),
    "late_blight": _entry("Potato", "Late Blight", "Dark water-soaked lesions on leaves and stems; white mould may appear in humid weather.", "Remove infected foliage and use Trichoderma in soil; avoid handling wet plants.", "Spray Mancozeb or chlorothalonil as per current DOA guidelines.", "Use healthy seed tubers, avoid overhead watering, and destroy crop residues."),
    "leaf_mold": _entry("Tomato", "Tomato Leaf Mould", "Pale yellow patches on upper leaves with olive-green mould on the underside.", "Improve ventilation and apply a neem-based spray to reduce surface infection.", "Mancozeb or chlorothalonil according to the DOA label.", "Reduce humidity, space plants well, and avoid wet foliage."),
    "mosaic_virus": _entry("Cucumber", "Cucumber Mosaic Virus", "Mosaic mottling, puckered leaves, shortened internodes, and distorted fruit.", "Remove infected vines and use neem oil or sticky traps against aphid vectors.", "No curative chemical exists; manage vectors with a DOA-registered product if required.", "Use certified seed, control weeds, disinfect tools, and remove infected plants."),
    "septoria_leaf_spot": _entry("Tomato", "Septoria Leaf Spot", "Many small circular spots with grey centres and dark margins, beginning on lower leaves.", "Remove lower leaves and apply Trichoderma; keep foliage dry.", "Mancozeb or chlorothalonil according to DOA recommendations.", "Rotate crops, mulch soil, improve spacing, and remove infected debris."),
    "single_prediction": _entry("General", "Unclassified Crop Condition", "The model detected a condition without a specific disease label.", "Isolate the plant, remove visibly diseased material, and consult an agricultural officer.", "Do not spray an unidentified chemical; identify the cause before treatment.", "Keep records, submit a clear sample for diagnosis, and maintain field hygiene."),
    "target_spot": _entry("Tomato", "Tomato Target Spot", "Circular brown lesions with concentric rings on leaves, stems, and fruit.", "Remove infected leaves and apply Trichoderma; improve canopy ventilation.", "Mancozeb or chlorothalonil as directed on a DOA-registered label.", "Use crop rotation, clean seed, mulch, and avoid overhead irrigation."),
    "twospotted_spider_mite": _entry("General", "Two-Spotted Spider Mite", "Fine webbing, yellow stippling, bronzing, and drying of leaves in hot dry weather.", "Wash plants, increase humidity carefully, and apply neem oil or insecticidal soap.", "Use a DOA-registered acaricide only when necessary and rotate modes of action.", "Reduce dust and water stress, conserve predatory mites, and scout leaf undersides."),
    "yellow_leaf_curl_virus": _entry("Tomato", "Yellow Leaf Curl Virus", "Upward leaf curl, yellow margins, shortened internodes, and severe stunting.", "Remove infected plants and use yellow sticky traps plus neem oil against whiteflies.", "There is no cure; use a DOA-registered whitefly insecticide for vector management.", "Use resistant seedlings, insect-proof nursery netting, weed control, and field sanitation."),
}


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE
CORS(app, resources={r"/*": {"origins": "*"}})

_interpreter: Any | None = None
_input_details: Any = None
_output_details: Any = None


def get_interpreter() -> tuple[Any, Any, Any]:
    """Load TFLite Interpreter lazily on first prediction request."""
    global _interpreter, _input_details, _output_details
    if _interpreter is None:
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")
        
        # TFLite Interpreter load කිරීම
        _interpreter = tflite.Interpreter(model_path=str(MODEL_PATH))
        _interpreter.allocate_tensors()
        _input_details = _interpreter.get_input_details()
        _output_details = _interpreter.get_output_details()

    return _interpreter, _input_details, _output_details


def preprocess_image(image: Image.Image) -> np.ndarray:
    """Convert a PIL image to normalized float32 batch input."""
    rgb_image = image.convert("RGB").resize(IMAGE_SIZE, Image.Resampling.LANCZOS)
    pixels = np.asarray(rgb_image, dtype=np.float32) / 255.0
    return np.expand_dims(pixels, axis=0)


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def error_response(message: str, status_code: int):
    return jsonify({"status": "error", "error": message}), status_code


@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "success", "message": "Crop disease detection API is running."})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model_loaded": _interpreter is not None})


@app.route("/predict", methods=["POST", "OPTIONS"])
def predict():
    if request.method == "OPTIONS":
        return ("", 204)

    uploaded_file = request.files.get("file") or request.files.get("image")
    if uploaded_file is None or not uploaded_file.filename:
        return error_response("No image file supplied. Use the 'file' or 'image' field.", 400)
    if not allowed_file(uploaded_file.filename):
        return error_response("Unsupported image type. Use JPG, JPEG, PNG, or WEBP.", 400)

    try:
        image = Image.open(uploaded_file.stream)
        input_tensor = preprocess_image(image)

        # TFLite Interpreter එකෙන් Prediction ලබා ගැනීම
        interpreter, input_details, output_details = get_interpreter()
        interpreter.set_tensor(input_details[0]["index"], input_tensor)
        interpreter.invoke()
        
        predictions = interpreter.get_tensor(output_details[0]["index"])
        scores = predictions[0] if predictions.ndim > 1 else predictions

        if len(scores) != len(CLASS_NAMES):
            raise ValueError(f"Model returned {len(scores)} classes; expected {len(CLASS_NAMES)}")

        class_index = int(np.argmax(scores))
        class_name = CLASS_NAMES[class_index]
        treatment = dict(TREATMENT_DB[class_name])
        
        requested_crop = request.form.get("crop", "").strip()
        if requested_crop:
            treatment["crop"] = requested_crop
            
        confidence = f"{float(scores[class_index]) * 100:.2f}%"
        
        response = {
            "status": "success", 
            "confidence": confidence, 
            "result": treatment,
            "disease_name": treatment["disease"] # Frontend compatibility එකට
        }
        
        return jsonify(response)

    except (UnidentifiedImageError, OSError):
        return error_response("The uploaded file is not a readable image.", 400)
    except FileNotFoundError as exc:
        return error_response(str(exc), 500)
    except Exception:
        app.logger.exception("Prediction failed")
        return error_response("Prediction failed due to an internal server error.", 500)


@app.errorhandler(RequestEntityTooLarge)
def handle_large_file(_error):
    return error_response("Image exceeds the 10 MB upload limit.", 400)


@app.errorhandler(404)
def handle_not_found(_error):
    return error_response("Endpoint not found.", 404)


if __name__ == "__main__":
    app.run(host=os.getenv("FLASK_HOST", "0.0.0.0"), port=int(os.getenv("PORT", "5000")))
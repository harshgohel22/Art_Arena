import tensorflowjs as tfjs
from tensorflow.keras.models import load_model

# Load the original HDF5 model
model = load_model("ArtArenaVENV/public/model/drawing_model.h5")
print(model.summary())
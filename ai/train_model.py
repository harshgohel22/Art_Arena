import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Flatten, Dense
from tensorflow.keras.utils import to_categorical
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras import Input
import os

# Define the 20 classes (words)
CLASSES = ["airplane", "alarm clock", "backpack", "basketball", "bicycle", "butterfly", "cake", "castle", "elephant", "flower",
           "guitar", "laptop", "pineapple", "pizza", "scissors", "snowflake", "strawberry", "tree", "watermelon", "wristwatch"]

# Load the preprocessed dataset
def load_data(dataset_path, classes, max_samples_per_class=500):
    X, y = [], []
    for idx, cls in enumerate(classes):
        file_path = os.path.join(dataset_path, f"{cls}_processed.npy")
        if not os.path.exists(file_path):
            print(f"Processed dataset for {cls} not found. Skipping...")
            continue

        data = np.load(file_path)
        data = data[:max_samples_per_class]  # Limit the number of samples
        X.append(data)
        y.append(np.full(data.shape[0], idx))  # Assign class index

    if len(X) == 0 or len(y) == 0:
        raise ValueError("No valid preprocessed data found. Ensure the dataset is preprocessed correctly.")

    X = np.concatenate(X, axis=0)
    y = np.concatenate(y, axis=0)
    return X, y

# Preprocess the data
def preprocess_data(X, y):
    X = X.reshape(-1, 28, 28, 1)  # Reshape to (28, 28, 1)
    y = to_categorical(y, num_classes=len(CLASSES))  # One-hot encode labels
    return X, y

# Load and preprocess the data
dataset_path = "ArtArenaVENV/GoogleDraw_dataset/processed"
X, y = load_data(dataset_path, CLASSES, max_samples_per_class=500)
X, y = preprocess_data(X, y)

# Split into training and testing sets
from sklearn.model_selection import train_test_split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Define the model
model = Sequential([
    Input(shape=(28, 28, 1)),  # Input layer
    Conv2D(16, (3, 3), activation='relu'),  # Convolutional layer
    MaxPooling2D((2, 2)),  # Max pooling layer
    Flatten(),  # Flatten layer
    Dense(64, activation='relu'),  # Dense layer
    Dense(len(CLASSES), activation='softmax')  # Output layer
])

# Compile the model
model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

# Add early stopping (if the model stops improving)
early_stopping = EarlyStopping(monitor='val_loss', patience=3, restore_best_weights=True)

# Train the model
model.fit(X_train, y_train, epochs=10, validation_data=(X_test, y_test), batch_size=128, callbacks=[early_stopping])

# Save the full model (architecture + weights) in HDF5 format
model.save("ArtArenaVENV/public/model/drawing_model.h5", )
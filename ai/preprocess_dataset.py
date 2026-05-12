import numpy as np
import os

# Define the 20 classes 
CLASSES = ["airplane", "alarm clock", "backpack", "basketball", "bicycle", "butterfly", "cake", "castle", "elephant", "flower",
                   "guitar", "laptop", "pineapple", "pizza", "scissors", "snowflake", "strawberry", "tree", "watermelon", "wristwatch"]

# Preprocess the dataset
def preprocess_dataset(dataset_path, output_path):
    for cls in CLASSES:
        #to prevent crashes
        file_path = os.path.join(dataset_path, f"{cls}.npy")
        if not os.path.exists(file_path):
            print(f"Dataset for {cls} not found. Skipping...")
            continue

        # Load the .npy file
        data = np.load(file_path)

        # Normalize the data to [0, 1]
        data = data / 255.0

        # Save the preprocessed data
        np.save(os.path.join(output_path, f"{cls}_processed.npy"), data)
        print(f"Preprocessed and saved {cls} dataset.")

# Paths
dataset_path = "ArtArenaVENV/GoogleDraw_dataset"
output_path = "ArtArenaVENV/GoogleDraw_dataset/processed"

# Create output directory if it doesn't exist
os.makedirs(output_path, exist_ok=True)

# Preprocess the dataset
preprocess_dataset(dataset_path, output_path)
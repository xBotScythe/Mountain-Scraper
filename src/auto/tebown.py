from PIL import Image, ImageEnhance
import sys, os
import urllib.request, urllib.response, urllib.parse
import numpy as np
from collections import deque

def download_file(url):
    """Downloads a file from a URL, preserving the original filename.

    Args:
        url: The URL of the file to download.

    Returns:
        The path to the downloaded file, or None on error.
    """
    try:
        # Get the filename from the URL
        file_name = "toTebown.png"
        if not file_name:
            print("Error: Could not extract filename from URL.")
            return None

        # Sanitize the filename (optional, but recommended)
        # file_name = "".join(x for x in file_name if x.isalnum() or x in "._- ")

        # Create the full local file path
        local_file_path = "./mountain_dew/" + file_name #save to current directory
        print(f"Downloading {url} to {local_file_path}")

        # Download the file
        urllib.request.urlretrieve(url, local_file_path)
        print(f"Downloaded to {local_file_path}")
        return local_file_path
    except Exception as e:
        print(f"Error downloading file: {e}")
        return None


def check_file_existence(file_path_string):
    """
    Checks if a file exists at the given path and prints debugging information.

    Args:
        file_path_string: The path to the file as a string.
    """
    print(f"Checking path: {file_path_string}")

    # Using os.path
    absolute_path_os = os.path.abspath(file_path_string)
    print(f"Absolute path (os): {absolute_path_os}")
    if os.path.isfile(absolute_path_os):
        print(f"File exists (os): {absolute_path_os}")
    else:
        print(f"File does not exist (os): {absolute_path_os}")

def overlay_image_horizontal_fit(background_path, foreground_path, output_path):
    """
    Overlays a foreground image onto a background image, resizing the foreground
    horizontally to match the background width. If the background is taller,
    the foreground is placed at the top.

    Args:
        background_path (str): Path to the background image file.
        foreground_path (str): Path to the foreground image file.
        output_path (str): Path to save the resulting image.
    """
    try:
        background = Image.open(background_path).convert("RGBA")
        foreground = Image.open(foreground_path).convert("RGBA")

        bg_width, bg_height = background.size
        fg_width, fg_height = foreground.size

        # Resize foreground horizontally to match background width
        new_fg_width = bg_width
        new_fg_height = int(fg_height * (new_fg_width / fg_width))
        resized_foreground = foreground.resize((new_fg_width, new_fg_height), Image.Resampling.LANCZOS)

        # Position the foreground at the top of the background
        x_position = 0
        y_position = 0

        # Create a new background to accommodate the potentially taller resized foreground
        new_background_height = max(bg_height, new_fg_height)
        new_background = Image.new("RGBA", (bg_width, new_background_height), (0, 0, 0, 0))
        new_background.paste(background, (0, 0))
        new_background.paste(resized_foreground, (x_position, y_position), resized_foreground)

        new_background.save(output_path)
        print(f"Image overlaid and saved to: {output_path}")

    except FileNotFoundError:
        print("Error: One or both image files not found.")
    except Exception as e:
        print(f"An error occurred: {e}")

def overlay_image_shrink_to_fit(background_path, foreground_path, output_path):
    """
    Overlays a foreground image onto a background image, shrinking the foreground
    if necessary to fit within the background dimensions while maintaining aspect ratio.

    Args:
        background_path (str): Path to the background image file.
        foreground_path (str): Path to the foreground image file.
        output_path (str): Path to save the resulting image.
    """
    try:
        background = Image.open(background_path).convert("RGBA")
        foreground = Image.open(foreground_path).convert("RGBA")

        bg_width, bg_height = background.size
        fg_width, fg_height = foreground.size

        # Calculate aspect ratios
        bg_aspect = bg_width / bg_height
        fg_aspect = fg_width / fg_height

        # Determine the scaling factor for the foreground image
        if fg_width > bg_width or fg_height > bg_height:
            if fg_aspect > bg_aspect:
                # Foreground is wider relative to its height
                new_width = bg_width
                new_height = int(new_width / fg_aspect)
            else:
                # Foreground is taller relative to its width or has similar aspect
                new_height = bg_height
                new_width = int(new_height * fg_aspect)

            foreground = foreground.resize((new_width, new_height), Image.Resampling.LANCZOS)

        # Calculate the position to center the foreground on the background
        x_position = (bg_width - foreground.width) // 2
        y_position = (bg_height - foreground.height) // 2

        # Paste the foreground onto the background
        background.paste(foreground, (x_position, y_position), foreground)
        background.save(output_path)
        print(f"Image overlaid and saved to: {output_path}")

    except FileNotFoundError:
        print("Error: One or both image files not found.")
    except Exception as e:
        print(f"An error occurred: {e}")

def remove(image):
    image_np = np.array(image)
    threshold = 245
    h, w = image_np.shape[:2]
    visited = np.zeros((h, w), dtype=bool)
    mask = np.zeros((h, w), dtype=bool)

    def is_white(px):
        return all(channel > threshold for channel in px[:3])

    # Start from corners
    queue = deque([(0, 0), (0, w-1), (h-1, 0), (h-1, w-1)])

    while queue:
        y, x = queue.popleft()
        if visited[y, x]:
            continue
        visited[y, x] = True

        if is_white(image_np[y, x]):
            mask[y, x] = True
            for dy, dx in [(-1,0), (1,0), (0,-1), (0,1)]:
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                    queue.append((ny, nx))
    # Make masked background transparent
    image_np[..., 3][mask] = 0

    # Save result
    return Image.fromarray(image_np)


def combined_overlay(background_path, foreground_path, output_path):
    """
    Overlays a foreground image onto a background image.
    - If the background is wider than the foreground, the foreground is stretched horizontally to match.
    - If the background is narrower or taller than the (potentially stretched) foreground,
      the foreground is shrunk proportionally to fit within the background's dimensions.
      The foreground is then placed at the top of the background.
    """
    try:
        background = Image.open(background_path).convert("RGBA")
        background = remove(background)
        foreground = Image.open(foreground_path).convert("RGBA").rotate(-28.5, expand=True)
        contrast_enhancer = ImageEnhance.Contrast(foreground)
        foreground = contrast_enhancer.enhance(3)
        bg_width, bg_height = background.size
        fg_width, fg_height = foreground.size

        # --- Step 1: Horizontal Stretch if Background is Wider ---
        stretched_foreground = foreground.copy()
        if bg_width > fg_width:
            new_fg_width = bg_width
            new_fg_height = int(fg_height * (new_fg_width / fg_width))
            stretched_foreground = foreground.resize((new_fg_width, new_fg_height), Image.Resampling.LANCZOS)

        stretched_fg_width, stretched_fg_height = stretched_foreground.size

        # --- Step 2: Shrink to Fit if Background is Smaller ---
        final_foreground = stretched_foreground.copy()
        if stretched_fg_width > bg_width or stretched_fg_height > bg_height:
            fg_aspect = stretched_fg_width / stretched_fg_height
            if fg_aspect > (bg_width / bg_height):
                # Foreground is wider relative to background
                new_width = bg_width
                new_height = int(new_width / fg_aspect)
            else:
                # Foreground is taller relative to background
                new_height = bg_height
                new_width = int(new_height * fg_aspect)
            final_foreground = stretched_foreground.resize((new_width, new_height), Image.Resampling.LANCZOS)

        final_fg_width, final_fg_height = final_foreground.size

        # --- Step 3: Position at the Top ---
        x_position = (bg_width - final_fg_width) // 2
        y_position = (bg_height - final_fg_height) // 2

        # Create a new background to accommodate the potentially taller resized foreground
        new_background_height = bg_height # We don't need to extend vertically in this logic
        new_background = Image.new("RGBA", (bg_width, new_background_height), (0, 0, 0, 0))
        new_background.paste(background, (0, 0))
        new_background.paste(final_foreground, (x_position, y_position), final_foreground)

        new_background.save(output_path)
        print(f"Image overlaid and saved to: {output_path}")

    except FileNotFoundError:
        print("Error: One or both image files not found.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    background_image_url  = sys.argv[1]  # Replace with your background image path
    try:
        urllib.parse.urlparse(background_image_url);
    except:
        print("Error: Invalid image_url.  Must be a valid URL.")
        sys.exit(1)
    # Download the image
    background_image = download_file(background_image_url)
    if background_image is None:
        print("Error: Failed to download the image.")
        sys.exit(1)
    foreground_image = os.getcwd() + "/mountain_dew/supernovateam.png"  # Replace with your foreground image path
    output_image = os.getcwd() + "/mountain_dew/output/" + sys.argv[2]
    check_file_existence(background_image)
    check_file_existence(foreground_image)
    combined_overlay(background_image, foreground_image, output_image)
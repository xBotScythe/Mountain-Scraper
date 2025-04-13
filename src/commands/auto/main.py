import re
import requests
from bs4 import BeautifulSoup
import os
from datetime import datetime
import pytz
import time

def get_formatted_datetime():
    eastern = pytz.timezone('US/Eastern')
    now = datetime.now(eastern)
    gmt_offset = now.strftime('%z')
    long_tz_name = time.tzname[time.localtime().tm_isdst]

    formatted = now.strftime(f'%a %b %d %Y %H:%M:%S GMT{gmt_offset} ({long_tz_name})')

    return formatted

def download_files(urls, folder_path):
    previous_links = []
    # Create the folder if it doesn't exist
    if not os.path.exists(folder_path):
        os.makedirs(folder_path)
    for url in urls:
        if(url in previous_links):
            continue
        filename = url.split("/")[-1]
        if("?" in filename):
            filename = filename.split("?")[0]
        file_path = os.path.join(folder_path, filename)
        if(os.path.exists(file_path)):
            continue
        try:
            # Send GET request to fetch the content
            response = requests.get(url, stream=True)

            # Check if the request was successful
            if response.status_code == 200:
                # Get the file name from the URL
                    # file_path = os.path.join(folder_path, filename[:-4] + f" ({counter})" + filename[-4:])
                    # counter += 1
                # Write the content to a file
                with open(file_path, "wb") as file:
                    for chunk in response.iter_content(chunk_size=1024):
                        if chunk:
                            file.write(chunk)

                print(f"Downloaded: {filename}")
                previous_links.append(url)
            else:
                print(f"Failed to download {url}: {response.status_code}")
        except Exception as e:
            print(f"Error downloading {url}: {e}")

# Base URL for the product page (without size parameter)
base_url = 'https://stage.pepsicoproductfacts.com/Json/FindProdItemLabelProds'

# Start a session for cookies and headers
session = requests.Session()

# Set the necessary headers
session.headers.update({
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://stage.pepsicoproductfacts.com/home/find',  # Adjust as needed
})

payload = {
    "group": "BEV",  # or "All" or "FDS" depending on what you want
    "category": "all",
    "brand": "[1015,1124,1025]", # code for Mtn Dew mainline
    "state": "V" + get_formatted_datetime(),
    "page": 1,
    "perPage": 100
    
}

page_list = []

# The page with product links and different size buttons
res = session.post(base_url, json=payload)

# Check if the request was successful
if res.ok:
    try:
        data = res.json()
        for product in data.get("Products", []):
            page_list.append("https://stage.pepsicoproductfacts.com/Home/Product?formula=" + product["FormulaSn"] + "&form=" + product["FormCd"] + "&size=" + str(product["SizeValue"]))
    except ValueError:
        print("Could not decode JSON. Response content:")
        print(res.text)
else:
    print("Request failed with status code:", res.status_code)

previous_pdf_img_links = [] 
all_pdf_links = []
all_image_links = []

for page in page_list:
    product_res = session.get(page)
    product_soup = BeautifulSoup(product_res.text, 'html.parser')
    links_on_page = product_soup.find_all('a', href=True)
    product_imgs = product_soup.find_all('img')
    filtered_imgs = [img for img in product_imgs if img.get('id') == "productImg"]
    alt_sizes = [link for link in product_soup.find_all('a', class_="product-link")]
    # for img in filtered_imgs:
    #     src = img['src']
    #     if(".jpg" in src) or (".png" in src) or (".jpeg" in src) or (".webp" in src):
    #         all_image_links.append("https://stage.pepsicoproductfacts.com" + src)
    for link in links_on_page:
        href = link['href']
        if(href in previous_pdf_img_links):
            continue
        if href.endswith('.pdf'):
            all_pdf_links.append(href)
            previous_pdf_img_links.append(href)
        elif href.endswith('.jpg') or href.endswith('.png'):
            all_image_links.append(href)
            previous_pdf_img_links.append(href)
        # Additionally, search for image and PDF links directly in the page text using regex
    pattern = re.compile(r'https://digitalassets\.pepsico\.com/m/[\w\d]+(?:\/[\w\d]+)*\.(?:jpg|png|pdf)', re.IGNORECASE)
    extra_links = pattern.findall(product_res.text)
    
    # Add the additional links to the respective lists
    for some_link in extra_links:
        if some_link.endswith('.pdf'):
            all_pdf_links.append(some_link)
            previous_pdf_img_links.append(some_link)
        elif some_link.endswith('.jpg') or some_link.endswith('.png'):
            all_image_links.append(some_link)
            previous_pdf_img_links.append(some_link)
    for a_link in alt_sizes:
        href = a_link['href']
        if(href in previous_pdf_img_links):
            continue
        if("size=" not in href):
            continue
        subproduct_res = session.get("https://stage.pepsicoproductfacts.com" + href)
        subproduct_soup = BeautifulSoup(subproduct_res.text, 'html.parser')
        links_on_subpage = subproduct_soup.find_all('a')
        #pattern = re.compile(r'https://digitalassets\.pepsico\.com/m/[\w\d]+(?:\/[\w\d]+)*\.(?:jpg|png|pdf)', re.IGNORECASE)
       # sub_extra_links = pattern.findall(subproduct_res.text)
        for sublink in links_on_subpage:
            if("pim-images" not in sublink.parent.parent['class']):
                continue
            sublink = sublink['href']  
            if sublink.endswith('.pdf'):
                all_pdf_links.append(sublink)
                previous_pdf_img_links.append(sublink)
            elif sublink.endswith('.jpg') or sublink.endswith('.png'):
                all_image_links.append(sublink)
                previous_pdf_img_links.append(sublink)
        

    # Print out all the PDF and image links found
    if all_pdf_links:
        print("Found PDF Links:")
        for pdf in all_pdf_links:
            print(pdf)
    else:
        print("No PDF links found.")

    if all_image_links:
        print("Found Image Links (JPG, PNG):")
        for img in all_image_links:
            print(img)
    else:
        print("No image links found.")
else:
    print(f"Failed to retrieve the initial page. Status code: {res.status_code}")

download_files(all_image_links, "mountain_dew_lbl")
download_files(all_pdf_links, "mountain_dew_lbl")    

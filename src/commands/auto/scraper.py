import re
import requests
from bs4 import BeautifulSoup
import os
from datetime import datetime
import pytz
import time
import json

# gets datetime in format for stage attribute in POST request body
def get_formatted_datetime():
    eastern = pytz.timezone('US/Eastern')
    now = datetime.now(eastern)
    gmt_offset = now.strftime('%z')
    long_tz_name = time.tzname[time.localtime().tm_isdst]

    formatted = now.strftime(f'%a %b %d %Y %H:%M:%S GMT{gmt_offset} ({long_tz_name})')
    return formatted

# downloads files.
def download_file(url:str, folder_path:str, filename:str=None):
    repeat_counter = 0
    if not os.path.exists(folder_path): 
        os.makedirs(folder_path)
    url_file = url.split("/")[-1]
    if(filename is None):
        filename = url_file
    elif("?" in filename): # used for pages like ...2394.png?r=35434
        filename = filename.split("?")[0]
    else:
        filename = filename + "." + url_file.split(".")[1]
    file_path = os.path.join(folder_path, filename)
    if(os.path.exists(file_path)): # ends function if file exists
        for f in os.listdir(folder_path):
            if(filename[:-4] in f):
                repeat_counter += 1
        file_path = file_path[:-4] + f" ({repeat_counter})" + file_path[-4:]
    try:
        # send GET request to get content
        response = requests.get(url, stream=True)

        # check if request is successful
        if(response.status_code == 200):
            # write content to file
            with open(file_path, "wb") as file:
                for chunk in response.iter_content(chunk_size=1024):
                    if chunk:
                        file.write(chunk)
            print(f"Downloaded:  { filename}")
        else:
            print(f"Failed to download {url}: {response.status_code}")
    except Exception as e:
        print(f"Error downloading {url}: {e}")


def scrape():
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

    page_dict = {"results": []}
    # The page with product links and different size buttons
    res = session.post(base_url, json=payload)

    # Check if the request was successful
    if res.ok:
        try:
            data = res.json()
            counter = 0
            for product in data.get("Products", []):
                page_dict["results"].append({"name": product["Name"]})
                page_dict["results"][counter].update({"link": "https://stage.pepsicoproductfacts.com/Home/Product?formula=" + product["FormulaSn"] + "&form=" + product["FormCd"] + "&size=" + str(product["SizeValue"])})
                page_dict["results"][counter].update({"size": str(product["SizeValue"]) + product["SizeCode"]})
                counter += 1

        except ValueError:
            print("Could not decode JSON. Response content:")
            print(res.text)
    else:
        print("Request failed with status code:", res.status_code)

    previous_pdf_img_links = [] 
    keylist = ["name", "images", "last_updated"]
    jsondict = dict.fromkeys(keylist)
    result_count = 0
    for result in page_dict["results"]:
        page = result["link"]
        all_pdf_links = []
        all_image_links = []
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
                all_image_links.append({"link": href, "size":f"{result["size"]}"})
                previous_pdf_img_links.append({"link": href, "size":f"{result["size"]}"})
            # Additionally, search for image and PDF links directly in the page text using regex
        pattern = re.compile(r'https://digitalassets\.pepsico\.com/m/[\w\d]+(?:\/[\w\d]+)*\.(?:jpg|png|pdf)', re.IGNORECASE)
        extra_links = pattern.findall(product_res.text)
        
        # Add the additional links to the respective lists
        for some_link in extra_links:
            if some_link.endswith('.pdf'):
                all_pdf_links.append({"link": some_link, "size":f"{result["size"]}"})
                previous_pdf_img_links.append(some_link)
            elif some_link.endswith('.jpg') or some_link.endswith('.png'):
                all_image_links.append({"link": some_link, "size":f"{result["size"]}"})
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
                    all_pdf_links.append({"link": sublink, "size":f"{href[-2:]}"})
                    previous_pdf_img_links.append(sublink)
                elif sublink.endswith('.jpg') or sublink.endswith('.png'):
                    all_image_links.append({"link": sublink, "size":f"{href[-2:]}"})
                    previous_pdf_img_links.append(sublink)

        page_dict["results"][result_count]["images"] = all_image_links
        page_dict["results"][result_count]["pdfs"] = all_pdf_links
        result_count += 1            
    
    return page_dict

# def imgScrapeToJSON(page_dict:dict, previous_links:list):
#     for product in page_dict["results"]:
#         if(product["img"] in previous_links):
#             product[
       




def main():
    page_dict = scrape()
    previous_links = []
    for result in page_dict["results"]:
        for link in result["images"]:        
            if(link["link"] in previous_links):
                continue
            download_file(link["link"], "mountain_dew/images", filename=f"{result["name"]} {link["size"]}")
            previous_links.append(link)
        # for pLink in result["pdfs"]:
        #     if(pLink[] in previous_links):
        #         continue
        #     download_file(pLink["link"], "mountain_dew/pdfs", filename=f"{result["name"]} {pLink["size"]}")   
        #     previous_links.append(pLink)


main()


                


        
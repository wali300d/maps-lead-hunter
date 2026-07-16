# 🎯 Maps Lead Hunter — Chrome Extension

Scrape Google Maps for businesses **without websites** — captures Name, Phone & Maps Link.

---

## 📦 Installation (Developer Mode)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle top-right)
3. Click **"Load unpacked"**
4. Select the `gmaps-scraper` folder
5. The extension icon appears in your toolbar ✅

---

## 🚀 How to Use

1. Go to **[google.com/maps](https://www.google.com/maps)**
2. Search for a business category + location — e.g.:
   - `restaurants in Rawalpindi`
   - `plumbers in Lahore`
   - `dentists in Karachi`
3. Wait for results to load in the left panel
4. Click the **Maps Lead Hunter** extension icon
5. Click **▶ Start Scraping**
6. **Scroll down** the results panel slowly to load more listings
7. The extension auto-clicks each card, checks for a website, and saves those **without one**
8. Export results as **CSV** or **JSON** when done

---

## 📋 Output Fields

| Field | Description |
|-------|-------------|
| **Name** | Business name |
| **Phone** | Phone number (or N/A) |
| **Maps Link** | Direct Google Maps URL |

---

## ⚙️ How It Works

- A **content script** runs on Google Maps pages
- When you start scraping, it watches the results panel for listing cards
- Each card is clicked to open its detail panel
- The script checks if a **"Website" button** exists
- If **no website** → the business is saved as a lead
- Results persist while the tab is open; export before closing

---
## 📸 Screenshots
<img width="1366" height="719" alt="{E989683D-90C9-4DC6-A2D8-4FF8E86D1678}" src="https://github.com/user-attachments/assets/c7ef7c11-4dcf-43ff-a41f-619990866fdd" />

<img width="1274" height="708" alt="{DE61787F-4B62-4054-87DC-3C92DE3D2753}" src="https://github.com/user-attachments/assets/4583b356-4d33-4668-b634-02e018f9dff9" />


## 💡 Tips

- Search specific niches: `"hair salons in Islamabad"` gives cleaner results
- Scroll the **left panel** slowly — new cards load lazily
- The 400ms delay between cards keeps it polite and avoids rate-limiting
- Run multiple searches and merge your CSVs

---

## ⚠️ Notes

- For personal/research use only — respect Google's Terms of Service
- Results are stored in memory; always export before closing the tab
- Works best with a stable internet connection

- ## ☕ Support the Project

If this tool helped you hunt down some great leads, consider supporting its development! 

### **Donate USDT (BEP20)**
* **Network:** BNB Smart Chain (BEP-20)
* **Address:** `0xDaE8289dE94f34c3586d7F00bF8a6dC905098159`
<img width="733" height="692" alt="WhatsApp Image 2026-07-16 at 9 00 32 PM" src="https://github.com/user-attachments/assets/f6dc1c9b-cdca-42ad-ac74-42e3283796e8" />

Thank you for your support! 🚀

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

// ProgressReader tracks upload progress
type ProgressReader struct {
	reader io.Reader
	total  int64
	read   int64
}

func (pr *ProgressReader) Read(p []byte) (int, error) {
	n, err := pr.reader.Read(p)
	pr.read += int64(n)
	if pr.total > 0 {
		percent := float64(pr.read) / float64(pr.total) * 100
		barLen := 30
		filled := int(float64(barLen) * float64(pr.read) / float64(pr.total))
		bar := strings.Repeat("█", filled) + strings.Repeat("-", barLen-filled)
		fmt.Printf("\rUploading [%s] %.1f%% (%d/%d MB)", bar, percent, pr.read/(1024*1024), pr.total/(1024*1024))
	}
	return n, err
}

func getConfigPath() string {
	usr, err := user.Current()
	if err != nil {
		home := os.Getenv("HOME")
		return filepath.Join(home, ".config", "cdn", "config")
	}
	return filepath.Join(usr.HomeDir, ".config", "cdn", "config")
}

func loadConfig() (string, string) {
	configPath := getConfigPath()
	data, err := os.ReadFile(configPath)
	if err != nil {
		return "", ""
	}
	var urlStr, pwd string
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "CDN_URL=") {
			urlStr = strings.Trim(strings.TrimPrefix(line, "CDN_URL="), "\"")
		} else if strings.HasPrefix(line, "CDN_PASSWORD=") {
			pwd = strings.Trim(strings.TrimPrefix(line, "CDN_PASSWORD="), "\"")
		}
	}
	return urlStr, pwd
}

func saveConfig(urlStr, pwd string) error {
	configPath := getConfigPath()
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	content := fmt.Sprintf("CDN_URL=\"%s\"\nCDN_PASSWORD=\"%s\"\n", urlStr, pwd)
	return os.WriteFile(configPath, []byte(content), 0600)
}

func copyToClipboard(text string, label string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("pbcopy")
	case "linux":
		if _, err := exec.LookPath("wl-copy"); err == nil {
			cmd = exec.Command("wl-copy")
		} else if _, err := exec.LookPath("xclip"); err == nil {
			cmd = exec.Command("xclip", "-selection", "clipboard")
		} else {
			return
		}
	default:
		return
	}
	cmd.Stdin = strings.NewReader(text)
	_ = cmd.Run()
	if label != "" {
		fmt.Printf("📋 %s copied to clipboard!\n", label)
	} else {
		fmt.Println("📋 Link copied to clipboard!")
	}
}

var Version = "v2.1.0"

func updateSelf() {
	fmt.Println("Checking for updates...")
	resp, err := http.Get("https://api.github.com/repos/dcronin05/cdn.dcron.in/releases/latest")
	if err != nil {
		fmt.Printf("❌ Failed to check for updates: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("❌ GitHub API returned %d\n", resp.StatusCode)
		os.Exit(1)
	}

	var release struct {
		TagName string `json:"tag_name"`
		Assets  []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		fmt.Printf("❌ Failed to decode release response: %v\n", err)
		os.Exit(1)
	}

	if release.TagName == Version {
		fmt.Printf("✔ You are already on the latest version (%s)\n", Version)
		os.Exit(0)
	}

	fmt.Printf("New version available: %s (current: %s)\n", release.TagName, Version)

	arch := runtime.GOARCH
	osName := runtime.GOOS
	targetAsset := fmt.Sprintf("cdn-%s-%s", osName, arch)
	if osName == "windows" {
		targetAsset += ".exe"
	}

	var downloadURL string
	for _, asset := range release.Assets {
		if asset.Name == targetAsset {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}

	if downloadURL == "" {
		fmt.Printf("❌ Could not find a binary matching your system (%s)\n", targetAsset)
		os.Exit(1)
	}

	fmt.Printf("Downloading %s...\n", downloadURL)
	binResp, err := http.Get(downloadURL)
	if err != nil {
		fmt.Printf("❌ Download failed: %v\n", err)
		os.Exit(1)
	}
	defer binResp.Body.Close()

	execPath, err := os.Executable()
	if err != nil {
		fmt.Printf("❌ Failed to determine current executable path: %v\n", err)
		os.Exit(1)
	}

	tmpFile := execPath + ".tmp"
	out, err := os.OpenFile(tmpFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		fmt.Printf("❌ Failed to create temp binary file: %v (try running with sudo?)\n", err)
		os.Exit(1)
	}

	_, err = io.Copy(out, binResp.Body)
	out.Close()
	if err != nil {
		os.Remove(tmpFile)
		fmt.Printf("❌ Failed to write binary: %v\n", err)
		os.Exit(1)
	}

	err = os.Rename(tmpFile, execPath)
	if err != nil {
		os.Remove(tmpFile)
		fmt.Printf("❌ Failed to replace executable: %v (try running with sudo?)\n", err)
		os.Exit(1)
	}

	fmt.Printf("✔ Successfully updated to %s!\n", release.TagName)
	os.Exit(0)
}

func printHelp() {
	fmt.Printf(`dcron.in / cronin.one Asset CLI Tool %s

USAGE:
  cdn [flags] <file-path>

EXAMPLES:
  cdn photo.png                                Upload a file to root
  cdn "Video Links for Presentation.docx"       Upload a file with spaces in filename
  cdn -f "school/fall-2026" diagram.png        Upload to a folder namespace
  cdn -m screenshot.png                        Upload and copy Markdown embed link to clipboard
  cdn photo.png --url https://media.cronin.one Custom server target

FLAGS:
  -f, --folder <path>                 Target folder / namespace (e.g. "school/fall-2026")
  -m, --markdown                      Copy Markdown embed link ![alt](url) to clipboard
  -d, --direct                        Copy direct URL instead of shortlink
  -u, --url <server-url>              Custom Asset Server URL
  -w, --password <password>           Custom Admin Password
  -v, --version                       Display CLI version
  -U, --update                        Update CLI to latest version
  -h, --help                          Display documentation
`, Version)
}

func isImageFile(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".gif" || ext == ".webp" || ext == ".svg"
}

func main() {
	if len(os.Args) < 2 {
		printHelp()
		os.Exit(1)
	}

	var filePath string
	var folder string
	var copyMarkdownFlag bool
	var copyDirectFlag bool
	var overrideURL string
	var overridePwd string

	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "-h" || arg == "--help" || arg == "help" {
			printHelp()
			os.Exit(0)
		} else if arg == "-v" || arg == "--version" || arg == "version" {
			fmt.Printf("cdn %s\n", Version)
			os.Exit(0)
		} else if (arg == "-f" || arg == "--folder") && i+1 < len(args) {
			folder = args[i+1]
			i++
		} else if arg == "-m" || arg == "--markdown" {
			copyMarkdownFlag = true
		} else if arg == "-d" || arg == "--direct" {
			copyDirectFlag = true
		} else if (arg == "-u" || arg == "--url") && i+1 < len(args) {
			overrideURL = args[i+1]
			i++
		} else if (arg == "-w" || arg == "--password") && i+1 < len(args) {
			overridePwd = args[i+1]
			i++
		} else if arg == "-U" || arg == "--update" || arg == "update" {
			updateSelf()
		} else if !strings.HasPrefix(arg, "-") {
			if filePath == "" {
				filePath = arg
			}
		}
	}

	if filePath == "" {
		fmt.Println("Error: No file specified.")
		printHelp()
		os.Exit(1)
	}

	fileInfo, err := os.Stat(filePath)
	if err != nil {
		fmt.Printf("Error: File '%s' not found.\n", filePath)
		os.Exit(1)
	}

	cdnURL, cdnPwd := loadConfig()
	if overrideURL != "" {
		cdnURL = overrideURL
	}
	if overridePwd != "" {
		cdnPwd = overridePwd
	}

	if cdnURL == "" || cdnPwd == "" {
		fmt.Println("=== Asset Server CLI Setup ===")
		fmt.Print("Server URL [https://media.cronin.one]: ")
		var inputURL string
		fmt.Scanln(&inputURL)
		if strings.TrimSpace(inputURL) != "" {
			cdnURL = strings.TrimSpace(inputURL)
		} else {
			cdnURL = "https://media.cronin.one"
		}

		fmt.Print("Admin Password: ")
		bytePwd, err := termReadPassword()
		if err != nil {
			fmt.Scanln(&cdnPwd)
		} else {
			cdnPwd = strings.TrimSpace(string(bytePwd))
			fmt.Println()
		}

		if err := saveConfig(cdnURL, cdnPwd); err == nil {
			fmt.Println("✔ Config saved!")
		}
	}

	fileName := filepath.Base(filePath)
	targetRelative := fileName
	if folder != "" {
		targetRelative = strings.Trim(folder, "/") + "/" + fileName
	}

	fmt.Printf("Uploading %s to %s...\n", targetRelative, cdnURL)

	file, err := os.Open(filePath)
	if err != nil {
		fmt.Printf("Error opening file: %v\n", err)
		os.Exit(1)
	}
	defer file.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	if folder != "" {
		_ = writer.WriteField("folder", folder)
	}

	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		fmt.Printf("Error creating form: %v\n", err)
		os.Exit(1)
	}

	progressReader := &ProgressReader{
		reader: file,
		total:  fileInfo.Size(),
	}

	_, err = io.Copy(part, progressReader)
	if err != nil {
		fmt.Printf("\nError reading file: %v\n", err)
		os.Exit(1)
	}
	writer.Close()

	req, err := http.NewRequest("POST", strings.TrimRight(cdnURL, "/")+"/api/upload", body)
	if err != nil {
		fmt.Printf("\nError creating request: %v\n", err)
		os.Exit(1)
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+cdnPwd)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("\n❌ Upload failed: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	fmt.Println()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		fmt.Printf("❌ Upload failed (HTTP %d): %s\n", resp.StatusCode, string(respBody))
		os.Exit(1)
	}

	var resData struct {
		Success   bool   `json:"success"`
		FileName  string `json:"fileName"`
		ShortCode string `json:"shortCode"`
		ShortUrl  string `json:"shortUrl"`
		DirectUrl string `json:"directUrl"`
	}
	_ = json.Unmarshal(respBody, &resData)

	directURL := resData.DirectUrl
	if directURL == "" {
		directURL = fmt.Sprintf("%s/%s", strings.TrimRight(cdnURL, "/"), targetRelative)
	}

	fmt.Printf("✔ Direct URL: %s\n", directURL)
	if resData.ShortUrl != "" {
		fmt.Printf("🔗 Shortlink:  %s\n", resData.ShortUrl)
	}

	if copyMarkdownFlag {
		var mdSnippet string
		safeURL := directURL
		if u, err := url.Parse(directURL); err == nil {
			u.Path = strings.ReplaceAll(url.PathEscape(u.Path), "%2F", "/")
			u.Path = strings.ReplaceAll(u.Path, "(", "%28")
			u.Path = strings.ReplaceAll(u.Path, ")", "%29")
			safeURL = u.String()
		} else {
			safeURL = strings.ReplaceAll(directURL, " ", "%20")
		}
		safeName := strings.ReplaceAll(strings.ReplaceAll(fileName, "[", "\\["), "]", "\\]")

		if isImageFile(fileName) {
			mdSnippet = fmt.Sprintf("![%s](%s)", safeName, safeURL)
		} else {
			mdSnippet = fmt.Sprintf("[%s](%s)", safeName, safeURL)
		}
		copyToClipboard(mdSnippet, "Markdown snippet")
	} else if copyDirectFlag || resData.ShortUrl == "" {
		copyToClipboard(directURL, "Direct URL")
	} else {
		copyToClipboard(resData.ShortUrl, "Shortlink")
	}
}

func termReadPassword() ([]byte, error) {
	var fd int
	if runtime.GOOS == "windows" {
		fd = int(os.Stdin.Fd())
	} else {
		fd = int(syscall.Stdin)
	}
	_ = fd
	var pwd string
	_, err := fmt.Scanln(&pwd)
	return []byte(pwd), err
}

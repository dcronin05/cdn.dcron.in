package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

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
	var url, pwd string
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "CDN_URL=") {
			url = strings.Trim(strings.TrimPrefix(line, "CDN_URL="), "\"")
		} else if strings.HasPrefix(line, "CDN_PASSWORD=") {
			pwd = strings.Trim(strings.TrimPrefix(line, "CDN_PASSWORD="), "\"")
		}
	}
	return url, pwd
}

func saveConfig(url, pwd string) error {
	configPath := getConfigPath()
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	content := fmt.Sprintf("CDN_URL=\"%s\"\nCDN_PASSWORD=\"%s\"\n", url, pwd)
	return os.WriteFile(configPath, []byte(content), 0600)
}

func copyToClipboard(text string) {
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
	fmt.Println("📋 Direct link copied to clipboard!")
}

var Version = "v1.4.0"

func printHelp() {
	fmt.Printf(`dcron.in CDN CLI Upload Tool %s

USAGE:
  cdn <file-path>

EXAMPLES:
  cdn photo.png                        Upload to https://cdn.dcron.in/photo.png
  cdn windows.iso                      Upload to https://cdn.dcron.in/windows.iso
  cdn photo.png --url https://cdn.dcron.in

FLAGS:
  -u, --url <server-url>              Custom CDN Server URL
  -w, --password <password>           Custom CDN Admin Password
  -v, --version                       Display CLI version
  -h, --help                          Display CLI documentation and usage
`, Version)
}

func main() {
	if len(os.Args) < 2 {
		printHelp()
		os.Exit(1)
	}

	var filePath string
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
		} else if (arg == "-u" || arg == "--url") && i+1 < len(args) {
			overrideURL = args[i+1]
			i++
		} else if (arg == "-w" || arg == "--password") && i+1 < len(args) {
			overridePwd = args[i+1]
			i++
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
		fmt.Println("=== dcron.in CDN CLI Setup ===")
		fmt.Print("CDN Server URL [https://cdn.dcron.in]: ")
		var inputURL string
		fmt.Scanln(&inputURL)
		if strings.TrimSpace(inputURL) != "" {
			cdnURL = strings.TrimSpace(inputURL)
		} else {
			cdnURL = "https://cdn.dcron.in"
		}

		fmt.Print("CDN Admin Password: ")
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

	targetName := filepath.Base(filePath)
	fmt.Printf("Uploading %s to %s...\n", targetName, cdnURL)

	file, err := os.Open(filePath)
	if err != nil {
		fmt.Printf("Error opening file: %v\n", err)
		os.Exit(1)
	}
	defer file.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", targetName)
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
	}
	_ = json.Unmarshal(respBody, &resData)

	publicURL := fmt.Sprintf("%s/%s", strings.TrimRight(cdnURL, "/"), targetName)
	fmt.Printf("✔ Direct URL: %s\n", publicURL)
	if resData.ShortUrl != "" {
		fmt.Printf("🔗 Shortlink:  %s\n", resData.ShortUrl)
		copyToClipboard(resData.ShortUrl)
	} else {
		copyToClipboard(publicURL)
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

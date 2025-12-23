// Loading overlay
const loadingOverlay = document.getElementById("loadingOverlay")
function showLoadingOverlay() {
  console.log("Showing loading overlay")
  if (loadingOverlay) loadingOverlay.style.display = "flex"
  else {
    console.warn("Loading overlay element not found")
  }
}
function hideLoadingOverlay() {
  if (loadingOverlay) loadingOverlay.style.display = "none"
}
// WebTorrent error page
const webtorrentErrorPage = document.getElementById("webtorrentErrorPage")

// Listen for webtorrent-error event from main process
if (window.electronAPI && window.electronAPI.onWebTorrentError) {
  window.electronAPI.onWebTorrentError((data) => {
    showWebTorrentErrorPage(data?.message)
  })
}

function showWebTorrentErrorPage(message) {
  homePage.style.display = "none"
  resultsPage.style.display = "none"
  profilePage.style.display = "none"
  playerPage.style.display = "none"
  webtorrentErrorPage.style.display = "flex"
  const errorMsg = webtorrentErrorPage.querySelector(".error-message")
  if (errorMsg && message) errorMsg.innerHTML = message
}
// Playback ended handler
if (window.electronAPI && window.electronAPI.onPlaybackEnded) {
  window.electronAPI.onPlaybackEnded(() => {
    console.log("Video playback ended")
    showProfilePage()
  })
}

let movies = []
let currentPage = 1
let totalPages = 1
let selectedMovie = null
let selectedQuality = null
let subtitlesEnabled = true
let currentStreamUrl = null

// Pages
const homePage = document.getElementById("homePage")
const resultsPage = document.getElementById("resultsPage")
const profilePage = document.getElementById("profilePage")
const playerPage = document.getElementById("playerPage")
const videoPlayer = document.getElementById("videoPlayer")
const playerBackBtn = document.getElementById("playerBackBtn")

// Home page elements
const homeSearchInput = document.getElementById("homeSearchInput")
const homeSearchBtn = document.getElementById("homeSearchBtn")

// Results page elements
const resultsSearchInput = document.getElementById("resultsSearchInput")
const resultsSearchBtn = document.getElementById("resultsSearchBtn")
const backBtn = document.getElementById("backBtn")
const resultsTitle = document.getElementById("resultsTitle")
const moviesGrid = document.getElementById("moviesGrid")

// Profile page elements
const profileBackBtn = document.getElementById("profileBackBtn")
const profilePoster = document.getElementById("profilePoster")
const profileTitle = document.getElementById("profileTitle")
const profileYear = document.getElementById("profileYear")
const profileRating = document.getElementById("profileRating")
const profileRuntime = document.getElementById("profileRuntime")
const profileDescription = document.getElementById("profileDescription")
const imdbInfo = document.getElementById("imdbInfo")
const imdbGenres = document.getElementById("imdbGenres")
const qualityOptions = document.getElementById("qualityOptions")
const subtitleToggle = document.getElementById("subtitleToggle")
const toggleSwitch = document.getElementById("toggleSwitch")
const subtitleStatus = document.getElementById("subtitleStatus")
const playBtn = document.getElementById("playBtn")
const stopBtn = document.getElementById("stopBtn")

// Event listeners
homeSearchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchMovies(homeSearchInput.value)
})
homeSearchBtn.addEventListener("click", () => searchMovies(homeSearchInput.value))

resultsSearchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchMovies(resultsSearchInput.value)
})
resultsSearchBtn.addEventListener("click", () => searchMovies(resultsSearchInput.value))

backBtn.addEventListener("click", showHomePage)
profileBackBtn.addEventListener("click", showResultsPage)

playerBackBtn.addEventListener("click", () => {
  videoPlayer.pause()
  videoPlayer.src = ""
  // Remove subtitle track if exists
  const tracks = videoPlayer.querySelectorAll('track')
  tracks.forEach(track => track.remove())
  playBtn.disabled = false
  stopBtn.classList.add("hidden")
  showProfilePage()
})

videoPlayer.addEventListener("stalled", () => {
  console.log("[v0] Video stalled, retrying in 1 second...")
  setTimeout(() => {
    videoPlayer.play().catch((err) => {
      console.log("[v0] Retry play failed:", err.message)
    })
  }, 1000)
})

videoPlayer.addEventListener("waiting", () => {
  console.log("[v0] Video waiting for data")
})

videoPlayer.addEventListener("error", () => {
  const error = videoPlayer.error
  if (error) {
    console.log("[v0] Video player error:", error.message)
    if (error.code === error.MEDIA_ERR_NETWORK || error.code === error.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      setTimeout(() => {
        console.log("[v0] Retrying video playback after error...")
        videoPlayer.load()
        videoPlayer.play().catch((err) => {
          console.log("[v0] Retry failed:", err.message)
        })
      }, 1500)
    }
  }
})

subtitleToggle.addEventListener("click", () => {
  subtitlesEnabled = !subtitlesEnabled
  toggleSwitch.classList.toggle("active", subtitlesEnabled)
  subtitleStatus.textContent = ""
})

stopBtn.addEventListener("click", stopStream)

// Navigation functions
function showHomePage() {
  homePage.classList.remove("hidden")
  resultsPage.style.display = "none"
  profilePage.style.display = "none"
  playerPage.style.display = "none"
  homeSearchInput.value = ""
}

function showResultsPage() {
  homePage.classList.add("hidden")
  resultsPage.style.display = "block"
  profilePage.style.display = "none"
  playerPage.style.display = "none"
}

function showProfilePage() {
  homePage.classList.add("hidden")
  resultsPage.style.display = "none"
  profilePage.style.display = "block"
  playerPage.style.display = "none"
  stopBtn.classList.add("hidden")
}

function showPlayerPage() {
  homePage.classList.add("hidden")
  resultsPage.style.display = "none"
  profilePage.style.display = "none"
  playerPage.style.display = "block"
}

// Search function
async function searchMovies(query, page = 1) {
  hideLoadingOverlay()
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return

  resultsTitle.innerHTML = "Searching..."
  moviesGrid.innerHTML = '<div class="loading-spinner"></div>'
  showResultsPage()
  resultsSearchInput.value = trimmedQuery

  const response = await window.electronAPI.searchMovies({ query: trimmedQuery, page })
  movies = response.movies || response
  currentPage = response.page || page
  totalPages = response.totalPages || 1

  if (!movies || movies.length === 0) {
    resultsTitle.textContent = "No Results Found"
    moviesGrid.innerHTML = '<p style="color: #b3b3b3;">Try searching for something else</p>'
    renderPagination()
    return
  }

  resultsTitle.textContent = `Found ${movies.length} results`
  displayMovies()
  renderPagination()
  hideLoadingOverlay()
}
// Register stream-progress handler ONCE at top-level
if (window.electronAPI && window.electronAPI.onStreamProgress) {
  window.electronAPI.onStreamProgress((data) => {
    console.log("Stream Progress:", data)
    if (typeof data === "string" && data.includes("webtorrentProcess = spawn")) {
      showLoadingOverlay()
    }
  })
}

// Register subtitle progress handler
if (window.electronAPI && window.electronAPI.onSubtitleProgress) {
  window.electronAPI.onSubtitleProgress((data) => {
    console.log("Subtitle Progress:", data)
    subtitleStatus.textContent = data
  })
}

// Display movies grid
function displayMovies() {
  moviesGrid.innerHTML = ""
  movies.forEach((movie) => {
    const card = document.createElement("div")
    card.className = "movie-card"
    const img = document.createElement("img")
    img.src = movie.medium_cover_image
    img.alt = movie.title
    img.className = "movie-poster"
    img.onerror = function () {
      this.onerror = null
      this.src = "img/placeholder.jpg"
    }
    card.appendChild(img)
    const titleDiv = document.createElement("div")
    titleDiv.className = "movie-title"
    titleDiv.textContent = movie.title
    card.appendChild(titleDiv)
    const metaDiv = document.createElement("div")
    metaDiv.className = "movie-meta"
    metaDiv.innerHTML = `
      <span>${movie.year}</span>
      <span>•</span>
      <span class="rating">${movie.rating}</span>
    `
    card.appendChild(metaDiv)
    card.addEventListener("click", () => showMovieProfile(movie))
    moviesGrid.appendChild(card)
  })
}

// Pagination controls
function renderPagination() {
  let pagination = document.getElementById("pagination")
  if (!pagination) {
    pagination = document.createElement("div")
    pagination.id = "pagination"
    pagination.style.display = "flex"
    pagination.style.justifyContent = "center"
    pagination.style.margin = "24px 0"
    moviesGrid.parentNode.appendChild(pagination)
  }
  pagination.innerHTML = ""
  if (totalPages <= 1) {
    pagination.style.display = "none"
    return
  }
  pagination.style.display = "flex"
  // Prev button
  const prevBtn = document.createElement("button")
  prevBtn.textContent = "Prev"
  prevBtn.disabled = currentPage === 1
  prevBtn.onclick = () => searchMovies(resultsSearchInput.value, currentPage - 1)
  pagination.appendChild(prevBtn)
  // Page info
  const pageInfo = document.createElement("span")
  pageInfo.textContent = ` Page ${currentPage} of ${totalPages} `
  pageInfo.style.margin = "0 12px"
  pagination.appendChild(pageInfo)
  // Next button
  const nextBtn = document.createElement("button")
  nextBtn.textContent = "Next"
  nextBtn.disabled = currentPage === totalPages
  nextBtn.onclick = () => searchMovies(resultsSearchInput.value, currentPage + 1)
  pagination.appendChild(nextBtn)
}

// Show movie profile
function showMovieProfile(movie) {
  selectedMovie = movie
  selectedQuality = null

  profilePoster.onerror = function () {
    this.onerror = null
    this.src = "img/placeholder.jpg"
  }
  profilePoster.src = movie.large_cover_image
  profileTitle.textContent = movie.title
  profileYear.textContent = movie.year
  profileRating.textContent = `${movie.rating} / 10`
  profileRuntime.textContent = `${movie.runtime} min`
  profileDescription.textContent = movie.description_full || movie.summary || "No description available."

  // Display genres
  if (movie.genres && movie.genres.length > 0) {
    imdbInfo.classList.remove("hidden")
    imdbGenres.innerHTML = movie.genres.map((genre) => `<span class="genre-tag">${genre}</span>`).join("")
  } else {
    imdbInfo.classList.add("hidden")
  }

  // Display quality options
  qualityOptions.innerHTML = ""
  movie.torrents.forEach((torrent) => {
    const btn = document.createElement("button")
    btn.className = "quality-btn"
    btn.innerHTML = `
      <div>${torrent.quality}</div>
      <div class="quality-info">${torrent.size} • ${torrent.seeds} seeds</div>
    `
    btn.addEventListener("click", () => selectQuality(torrent, btn))
    qualityOptions.appendChild(btn)
  })

  subtitleStatus.textContent = ""
  toggleSwitch.classList.add("active")
  subtitlesEnabled = true

  showProfilePage()
}

// Select quality
function selectQuality(torrent, button) {
  selectedQuality = torrent

  document.querySelectorAll(".quality-btn").forEach((btn) => {
    btn.classList.remove("selected")
  })
  button.classList.add("selected")
}

// Add subtitle track to video player
function addSubtitleTrack(subtitleUrl) {
  console.log('[Subtitle] Adding track with URL:', subtitleUrl)
  
  // Remove any existing tracks
  const existingTracks = videoPlayer.querySelectorAll('track')
  existingTracks.forEach(track => {
    console.log('[Subtitle] Removing existing track')
    track.remove()
  })

  if (subtitleUrl) {
    const track = document.createElement('track')
    track.kind = 'subtitles'
    track.label = 'English'
    track.srclang = 'en'
    track.src = subtitleUrl
    track.default = true
    
    track.addEventListener('load', () => {
      console.log('[Subtitle] Track loaded successfully')
      if (videoPlayer.textTracks.length > 0) {
        videoPlayer.textTracks[0].mode = 'showing'
        console.log('[Subtitle] Track mode set to showing')
      }
    })
    
    track.addEventListener('error', (e) => {
      console.error('[Subtitle] Track load error:', e)
    })
    
    videoPlayer.appendChild(track)
    console.log('[Subtitle] Track element appended to video player')
  } else {
    console.log('[Subtitle] No subtitle URL provided')
  }
}

// Start streaming
async function startStream() {
  console.log("Starting stream!")
  if (!selectedQuality) {
    alert("Please select a quality option")
    return
  }

  showLoadingOverlay()
  playBtn.disabled = true
  stopBtn.classList.remove("hidden")
  
  console.log('[Stream] Subtitles enabled:', subtitlesEnabled)
  console.log('[Stream] Movie data:', {
    title: selectedMovie.title,
    year: selectedMovie.year,
    imdb_code: selectedMovie.imdb_code
  })
  
  try {
    const response = await window.electronAPI.startStream({
      hash: selectedQuality.hash,
      title: selectedMovie.title,
      quality: selectedQuality.quality,
      useSubtitles: subtitlesEnabled,
      movieData: {
        title: selectedMovie.title,
        year: selectedMovie.year,
        imdb_code: selectedMovie.imdb_code,
      },
    })

    console.log('[Stream] Full response received:', JSON.stringify(response, null, 2))
    
    currentStreamUrl = response.url
    videoPlayer.src = currentStreamUrl
    
    console.log('[Stream] Response:', response)
    console.log('[Stream] Subtitle URL:', response.subtitleUrl)
    console.log('[Stream] Subtitle URL type:', typeof response.subtitleUrl)
    
    // Add subtitle track if available
    if (response.subtitleUrl) {
      console.log('[Stream] Adding subtitles')
      addSubtitleTrack(response.subtitleUrl)
    } else {
      console.log('[Stream] No subtitles in response')
    }
    
    videoPlayer.play()
    showPlayerPage()
    hideLoadingOverlay()
  } catch (error) {
    console.error("Stream failed to start:", error)
    hideLoadingOverlay()
    playBtn.disabled = false
    alert("Failed to start stream: " + error.message)
  }
}

// Stop streaming
async function stopStream() {
  console.log("Stopping stream!")
  await window.electronAPI.stopStream()
  playBtn.disabled = false
  stopBtn.classList.add("hidden")
  hideLoadingOverlay()
  videoPlayer.pause()
  videoPlayer.src = ""
  // Remove subtitle tracks
  const tracks = videoPlayer.querySelectorAll('track')
  tracks.forEach(track => track.remove())
}

playBtn.addEventListener("click", startStream)
stopBtn.addEventListener("click", stopStream)
// ==================== LOADING OVERLAY ====================
const loadingOverlay = document.getElementById("loadingOverlay")

function showLoadingOverlay() {
  console.log("Showing loading overlay")
  if (loadingOverlay) loadingOverlay.style.display = "flex"
  else console.warn("Loading overlay element not found")
}

function hideLoadingOverlay() {
  if (loadingOverlay) loadingOverlay.style.display = "none"
}

// ==================== ERROR HANDLING ====================
const webtorrentErrorPage = document.getElementById("webtorrentErrorPage")

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
  if (webtorrentErrorPage) {
    webtorrentErrorPage.style.display = "flex"
    const errorMsg = webtorrentErrorPage.querySelector(".error-message")
    if (errorMsg && message) errorMsg.innerHTML = message
  }
}

if (window.electronAPI && window.electronAPI.onPlaybackEnded) {
  window.electronAPI.onPlaybackEnded(() => {
    console.log("Video playback ended")
    showProfilePage()
  })
}

// ==================== STATE VARIABLES ====================
let movies = []
let currentPage = 1
let totalPages = 1
let selectedMovie = null
let selectedQuality = null
let subtitlesEnabled = true
let currentStreamUrl = null

// ==================== DOM ELEMENTS ====================
// Pages
const homePage = document.getElementById("homePage")
const resultsPage = document.getElementById("resultsPage")
const profilePage = document.getElementById("profilePage")
const playerPage = document.getElementById("playerPage")

// Video Player Elements
const videoPlayer = document.getElementById("videoPlayer")
const videoContainer = document.getElementById("videoContainer")
const playerBackBtn = document.getElementById("playerBackBtn")
const playPauseBtn = document.getElementById("playPauseBtn")
const fullscreenBtn = document.getElementById("fullscreenBtn")
const overlay = document.getElementById("videoOverlay")
const seekBar = document.getElementById("seekBar")
const currentTimeDisplay = document.getElementById("currentTime")
const durationDisplay = document.getElementById("duration")

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
const imdbGenres = document.getElementById("imdbGenres")
const qualityOptions = document.getElementById("qualityOptions")
const subtitleToggle = document.getElementById("subtitleToggle")
const toggleSwitch = document.getElementById("toggleSwitch")
const subtitleStatus = document.getElementById("subtitleStatus")
const playBtn = document.getElementById("playBtn")
const stopBtn = document.getElementById("stopBtn")

// ==================== NAVIGATION FUNCTIONS ====================
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

// ==================== VIDEO PLAYER FUNCTIONS ====================
// Format time helper
function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

// Update duration when metadata loads
videoPlayer.addEventListener('loadedmetadata', () => {
  if (videoPlayer.duration && isFinite(videoPlayer.duration)) {
    durationDisplay.textContent = formatTime(videoPlayer.duration)
    seekBar.max = videoPlayer.duration
  }
})

// Update current time and seek bar as video plays
videoPlayer.addEventListener('timeupdate', () => {
  if (videoPlayer.duration && isFinite(videoPlayer.duration)) {
    currentTimeDisplay.textContent = formatTime(videoPlayer.currentTime)
    seekBar.value = videoPlayer.currentTime

    // Update seek bar max in case it wasn't set yet
    if (seekBar.max != videoPlayer.duration) {
      seekBar.max = videoPlayer.duration
    }
  }
})

// Seek when slider moves
seekBar.addEventListener('input', () => {
  const time = parseFloat(seekBar.value)
  if (!isNaN(time)) {
    videoPlayer.currentTime = time
  }
})

// Play/Pause button
playPauseBtn.addEventListener('click', () => {
  if (videoPlayer.paused) {
    videoPlayer.play()
  } else {
    videoPlayer.pause()
  }
})

// Update play/pause button icon
videoPlayer.addEventListener('play', () => {
  playPauseBtn.textContent = '⏸'
  resetIdle()
})

videoPlayer.addEventListener('pause', () => {
  playPauseBtn.textContent = '▶'
  videoContainer.classList.remove('user-idle')
  clearTimeout(idleTimer)
})

// ==================== FULLSCREEN & UI IDLE ====================
let idleTimer

function hideUI() {
  if (!videoPlayer.paused) {
    videoContainer.classList.add('user-idle')
  }
}

function resetIdle() {
  videoContainer.classList.remove('user-idle')
  clearTimeout(idleTimer)
  idleTimer = setTimeout(hideUI, 3000) // 3 seconds
}

videoContainer.addEventListener('mousemove', resetIdle)
videoContainer.addEventListener('mousedown', resetIdle)

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    videoContainer.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable full-screen mode: ${err.message}`)
    })
  } else {
    document.exitFullscreen()
  }
}

// Fullscreen on button click
fullscreenBtn.addEventListener('click', toggleFullscreen)

// Fullscreen on double click
overlay.addEventListener('dblclick', toggleFullscreen)

// Single click to play/pause
overlay.addEventListener('click', () => {
  if (videoPlayer.paused) {
    videoPlayer.play()
  } else {
    videoPlayer.pause()
  }
})

// ==================== KEYBOARD SHORTCUTS ====================
window.addEventListener('keydown', (e) => {
  if (playerPage.style.display !== 'none') {
    if (e.code === 'Space') {
      e.preventDefault()
      if (videoPlayer.paused) {
        videoPlayer.play()
      } else {
        videoPlayer.pause()
      }
    }
    if (e.code === 'KeyF') {
      toggleFullscreen()
    }
    if (e.code === 'ArrowRight') {
      videoPlayer.currentTime += 10
    }
    if (e.code === 'ArrowLeft') {
      videoPlayer.currentTime -= 10
    }
  }
})

// ==================== VIDEO ERROR HANDLING ====================
videoPlayer.addEventListener("stalled", () => {
  console.log("[Video] Stalled, retrying in 1 second...")
  setTimeout(() => {
    videoPlayer.play().catch((err) => {
      console.log("[Video] Retry play failed:", err.message)
    })
  }, 1000)
})

videoPlayer.addEventListener("waiting", () => {
  console.log("[Video] Waiting for data")
})

videoPlayer.addEventListener("error", () => {
  const error = videoPlayer.error
  if (error) {
    console.log("[Video] Player error:", error.message)
    if (error.code === error.MEDIA_ERR_NETWORK || error.code === error.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      setTimeout(() => {
        console.log("[Video] Retrying video playback after error...")
        videoPlayer.load()
        videoPlayer.play().catch((err) => {
          console.log("[Video] Retry failed:", err.message)
        })
      }, 1500)
    }
  }
})

// ==================== PLAYER BACK BUTTON ====================
playerBackBtn.addEventListener("click", () => {
  videoPlayer.pause()
  videoPlayer.src = ""

  // Remove subtitle track if exists
  const tracks = videoPlayer.querySelectorAll('track')
  tracks.forEach(track => track.remove())

  if (document.fullscreenElement) {
    document.exitFullscreen()
  }

  playBtn.disabled = false
  stopBtn.classList.add("hidden")
  showProfilePage()
})

// ==================== SEARCH FUNCTIONS ====================
homeSearchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchMovies(homeSearchInput.value)
})
homeSearchBtn.addEventListener("click", () => searchMovies(homeSearchInput.value))

resultsSearchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchMovies(resultsSearchInput.value)
})
resultsSearchBtn.addEventListener("click", () => searchMovies(resultsSearchInput.value))

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

// ==================== DISPLAY MOVIES ====================
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

// ==================== PAGINATION ====================
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

// ==================== MOVIE PROFILE ====================
backBtn.addEventListener("click", showHomePage)
profileBackBtn.addEventListener("click", showResultsPage)

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
    imdbGenres.innerHTML = movie.genres.map((genre) => `<span class="genre-tag">${genre}</span>`).join("")
  } else {
    imdbGenres.innerHTML = ""
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

function selectQuality(torrent, button) {
  selectedQuality = torrent

  document.querySelectorAll(".quality-btn").forEach((btn) => {
    btn.classList.remove("selected")
  })
  button.classList.add("selected")
}

// ==================== SUBTITLE TOGGLE ====================
subtitleToggle.addEventListener("click", () => {
  subtitlesEnabled = !subtitlesEnabled
  toggleSwitch.classList.toggle("active", subtitlesEnabled)
  subtitleStatus.textContent = ""
})

// ==================== SUBTITLE TRACK ====================
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

// ==================== STREAM PROGRESS HANDLERS ====================
if (window.electronAPI && window.electronAPI.onStreamProgress) {
  window.electronAPI.onStreamProgress((data) => {
    console.log("Stream Progress:", data)
    if (typeof data === "string" && data.includes("webtorrentProcess = spawn")) {
      showLoadingOverlay()
    }
  })
}

if (window.electronAPI && window.electronAPI.onSubtitleProgress) {
  window.electronAPI.onSubtitleProgress((data) => {
    console.log("Subtitle Progress:", data)
    subtitleStatus.textContent = data
  })
}

// ==================== START STREAM ====================
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

    if (response.success) {
      currentStreamUrl = response.url
      if (response.success && response.url) {
        // Validate URL is from localhost
        try {
          const url = new URL(response.url);
          if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
            throw new Error('Invalid stream URL - must be localhost');
          }
          currentStreamUrl = response.url;
          videoPlayer.src = currentStreamUrl;
          videoPlayer.load();
        } catch (error) {
          throw new Error('Invalid stream URL format');
        }
      }

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
    } else {
      throw new Error('Stream response was not successful')
    }
  } catch (error) {
    console.error("Stream failed to start:", error)
    hideLoadingOverlay()
    playBtn.disabled = false
    stopBtn.classList.add("hidden")
    alert("Failed to start stream: " + error.message)
  }
}

// ==================== STOP STREAM ====================
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
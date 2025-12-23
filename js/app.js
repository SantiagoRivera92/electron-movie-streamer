let movies = []
let selectedMovie = null
let selectedQuality = null
let subtitlesEnabled = true

// Pages
const homePage = document.getElementById("homePage")
const resultsPage = document.getElementById("resultsPage")
const profilePage = document.getElementById("profilePage")

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

subtitleToggle.addEventListener("click", () => {
  subtitlesEnabled = !subtitlesEnabled
  toggleSwitch.classList.toggle("active", subtitlesEnabled)
  subtitleStatus.textContent = ""
})

playBtn.addEventListener("click", startStream)
stopBtn.addEventListener("click", stopStream)

// Navigation functions
function showHomePage() {
  homePage.classList.remove("hidden")
  resultsPage.style.display = "none"
  profilePage.style.display = "none"
  homeSearchInput.value = ""
}

function showResultsPage() {
  homePage.classList.add("hidden")
  resultsPage.style.display = "block"
  profilePage.style.display = "none"
}

function showProfilePage() {
  homePage.classList.add("hidden")
  resultsPage.style.display = "none"
  profilePage.style.display = "block"
  stopBtn.classList.add("hidden")
}

// Search function
async function searchMovies(query) {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return

  resultsTitle.innerHTML = "Searching..."
  moviesGrid.innerHTML = '<div class="loading-spinner"></div>'
  showResultsPage()
  resultsSearchInput.value = trimmedQuery

  movies = await window.electronAPI.searchMovies(trimmedQuery)

  if (movies.length === 0) {
    resultsTitle.textContent = "No Results Found"
    moviesGrid.innerHTML = '<p style="color: #b3b3b3;">Try searching for something else</p>'
    return
  }

  resultsTitle.textContent = `Found ${movies.length} results`
  displayMovies()
}

// Display movies grid
function displayMovies() {
  moviesGrid.innerHTML = ""

  movies.forEach((movie) => {
    const card = document.createElement("div")
    card.className = "movie-card"
    card.innerHTML = `
      <img src="${movie.medium_cover_image}" alt="${movie.title}" class="movie-poster" />
      <div class="movie-title">${movie.title}</div>
      <div class="movie-meta">
        <span>${movie.year}</span>
        <span>•</span>
        <span class="rating">${movie.rating}</span>
      </div>
    `
    card.addEventListener("click", () => showMovieProfile(movie))
    moviesGrid.appendChild(card)
  })
}

// Show movie profile
function showMovieProfile(movie) {
  selectedMovie = movie
  selectedQuality = null

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

// Start streaming
async function startStream() {
  if (!selectedQuality) {
    alert("Please select a quality option")
    return
  }

  playBtn.disabled = true
  stopBtn.classList.remove("hidden")
  try {
    await window.electronAPI.startStream({
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
  } catch (error) {
    playBtn.disabled = false
  }
}

// Stop streaming
async function stopStream() {
  await window.electronAPI.stopStream()
  playBtn.disabled = false
  stopBtn.classList.add("hidden")
}
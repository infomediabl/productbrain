/**
 * Core Container Page
 * Page: container.html
 * Globals used: (none — this is the root script)
 * Globals defined: containerId, container, editingMetaId, loadContainer(), renderHeader(), esc()
 * API: GET /api/containers/:id
 * Interacts with: All other container.html scripts depend on this file.
 *   Calls renderEntries(), renderIdeatorSection(), renderCaseStudies(), renderMetadata(),
 *   renderScrapes(), renderCompetitorAnalyses(), renderOwnProductSeo(), renderSeoAnalyses(),
 *   checkGadsStatus(), renderKeywordStrategies(), renderTestPlans(), renderLandingPages(),
 *   renderQuizzes(), renderImageAds(), renderSpinoffIdeas(),
 *   renderProposals(), renderPrompts(), loadContainerContext().
 *
 * Reads containerId from URL query param, fetches the container object, and orchestrates
 * rendering across all container.html sub-modules. Defines the shared esc() HTML-escape utility.
 */
const params = new URLSearchParams(window.location.search);
const containerId = params.get('id');
let container = null;
let editingMetaId = null;

// Initialization happens after all split JS files are loaded — see initContainer() at bottom

async function loadContainer() {
  const res = await fetch(`/api/containers/${containerId}`);
  if (!res.ok) { alert('Container not found'); window.location.href = '/'; return; }
  container = await res.json();
  document.title = `${container.name} - ProductBrain`;
  renderHeader();
  renderProjectOverview();
  renderEntries();
  renderIdeatorSection();
  renderCaseStudies();
  renderMetadata();
  renderScrapes();
  renderCompetitorAnalyses();
  renderOwnProductSeo();
  renderSeoAnalyses();
  checkGadsStatus();
  renderKeywordStrategies();
  renderTestPlans();
  renderLandingPages();
  renderQuizzes();
  renderImageAds();
  renderSpinoffIdeas();
  renderProposals();
  renderPrompts();
  renderDataFeeds();
  loadContainerContext();
}

function renderHeader() {
  document.getElementById('container-name').textContent = container.name;
  document.getElementById('edit-link').href = `/add-container.html?id=${container.id}`;
  const chatLink = document.getElementById('chat-page-link');
  if (chatLink) chatLink.href = `/chat.html?cid=${container.id}`;
  const workshopLink = document.getElementById('workshop-link');
  if (workshopLink) workshopLink.href = `/ad-workshop.html?cid=${container.id}`;
  const taboolaLink = document.getElementById('taboola-link');
  if (taboolaLink) taboolaLink.href = `/taboola-workshop.html?cid=${container.id}`;
  const validatorLink = document.getElementById('validator-link');
  if (validatorLink) validatorLink.href = `/content-validator.html?cid=${container.id}`;
  const datafeedLink = document.getElementById('datafeed-link');
  if (datafeedLink) datafeedLink.href = `/data-feed.html?cid=${container.id}`;
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

window.addEventListener('beforeunload', () => {
  if (typeof scrapePollTimer !== 'undefined' && scrapePollTimer) clearTimeout(scrapePollTimer);
  if (typeof proposalPollTimer !== 'undefined' && proposalPollTimer) clearTimeout(proposalPollTimer);
  if (typeof spinoffPollTimer !== 'undefined' && spinoffPollTimer) clearTimeout(spinoffPollTimer);
});

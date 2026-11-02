import './styles/main.css';
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { LocationProvider, Route, Router, useLocation } from 'preact-iso';
import { effect, untracked } from '@preact/signals';
import { registerSW } from 'virtual:pwa-register';
import { account } from './lib/account';
import { loadMyFollows, myFollows } from './lib/follows';
import { ensureProfiles, ensureShortTag } from './lib/profiles';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { ArchiveUser } from './pages/ArchiveUser';
import { BookForm } from './pages/BookForm';
import { Home } from './pages/Home';
import { Import } from './pages/Import';
import { Login } from './pages/Login';
import { NodePage } from './pages/NodePage';
import { NotFound } from './pages/NotFound';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { Subscriptions } from './pages/Subscriptions';
import { UserPage } from './pages/UserPage';
import { WishForm } from './pages/WishForm';

// Старые ссылки v1: /#/<ник>/books?u=<id> (и то же без #) ведут в архив.
function redirectOldUrls(): boolean {
  const { hash, pathname, search } = location;
  const old = hash.startsWith('#/') ? hash.slice(1) : pathname + search;
  const m = old.match(/^\/[^/?]+\/books\?(.*)$/);
  const id = m && new URLSearchParams(m[1]).get('u');
  if (id) history.replaceState(null, '', `/archive/${encodeURIComponent(id)}`);
  else if (hash.startsWith('#/')) history.replaceState(null, '', '/');
  else return false;
  return true;
}
redirectOldUrls();
// Старая ссылка, открытая на уже загруженной странице, меняет только hash.
window.addEventListener('hashchange', () => {
  if (redirectOldUrls()) dispatchEvent(new PopStateEvent('popstate'));
});

// Только при входе и выходе. Без untracked эффект подписывался и на сигналы, которые
// читают ensureProfiles и query (профили, список relay), и заново качал подписки после
// каждой загрузки любого профиля — заодно мог затереть только что поставленную звезду.
effect(() => {
  const acc = account.value;
  untracked(() => {
    if (acc) {
      ensureProfiles([acc.pk]);
      loadMyFollows().catch(() => (myFollows.value = []));
      ensureShortTag(acc.pk).catch(() => {});
    } else {
      myFollows.value = null;
    }
  });
});

// Service Worker сам проверяет обновления только при полной загрузке страницы, и вкладка,
// открытая часами, жила на старой версии. Поэтому проверяем и при переходах по сайту, не чаще
// раза в 10 минут. Нашлась новая версия — страница перезагрузится (autoUpdate) сразу после
// перехода, и недописанная форма не пропадёт: с неё уже ушли.
let swRegistration: ServiceWorkerRegistration | undefined;
let lastUpdateCheck = 0;
function checkForUpdate() {
  if (!swRegistration || !navigator.onLine || Date.now() - lastUpdateCheck < 10 * 60 * 1000) return;
  lastUpdateCheck = Date.now();
  swRegistration.update().catch(() => {});
}

function OnNavigate() {
  const { path } = useLocation();
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
    checkForUpdate();
  }, [path]);
  return null;
}

function App() {
  return (
    <LocationProvider>
      <OnNavigate />
      <Navbar />
      <div class="container main-content">
        <Router>
          <Route path="/" component={Home} />
          <Route path="/search" component={Search} />
          <Route path="/archive/:id" component={ArchiveUser} />
          <Route path="/archive/:id/:tab" component={ArchiveUser} />
          <Route path="/import/:id" component={Import} />
          <Route path="/u/:id" component={UserPage} />
          <Route path="/u/:id/:tab" component={UserPage} />
          <Route path="/book/add" component={BookForm} />
          <Route path="/book/edit/:d" component={BookForm} />
          <Route path="/wish/add" component={WishForm} />
          <Route path="/wish/edit/:d" component={WishForm} />
          <Route path="/login" component={Login} />
          <Route path="/settings" component={Settings} />
          <Route path="/subscriptions" component={Subscriptions} />
          <Route path="/node" component={NodePage} />
          <Route default component={NotFound} />
        </Router>
      </div>
      <Footer />
    </LocationProvider>
  );
}

render(<App />, document.getElementById('app')!);

// Новая версия сайта применяется сразу: когда Service Worker скачал её, страница
// перезагружается. Без этого после выкладки читатель видел старую версию до
// второго обновления страницы.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    swRegistration = registration;
    lastUpdateCheck = Date.now(); // при загрузке страницы браузер проверил сам
  },
});

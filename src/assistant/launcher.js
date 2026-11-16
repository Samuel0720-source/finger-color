// The small "Ask" button in the corner. The chat panel itself is only downloaded on the first press.
import './chat.css';

export function mountAssistant(app) {
  const launcher = document.getElementById('assist-launcher');
  if (!launcher) return;
  let chat = null;
  let loading = null;
  launcher.addEventListener('click', async () => {
    if (!chat) {
      launcher.dataset.loading = 'true';
      try {
        loading ??= import('./chat.js');
        const { createChat } = await loading;
        chat ??= createChat({ app, launcher });
      } catch {
        loading = null;
        launcher.dataset.loading = 'false';
        return; // offline on the first press: the button stays and can be pressed again
      }
      launcher.dataset.loading = 'false';
      return chat.open();
    }
    chat.toggle();
  });
}

using GameStudio.Models;

namespace GameStudio.Services;

public class UserSession
{
    public User? CurrentUser { get; private set; }
    public event Action? OnChange;

    public void SetUser(User? user)
    {
        CurrentUser = user;
        OnChange?.Invoke();
    }
}

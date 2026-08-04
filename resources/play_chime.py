import winsound
import time

def play_chime():
    # Play a simple sequence to indicate completion
    winsound.Beep(523, 100) # C5
    time.sleep(0.05)
    winsound.Beep(659, 100) # E5
    time.sleep(0.05)
    winsound.Beep(784, 200) # G5

if __name__ == "__main__":
    play_chime()

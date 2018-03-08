#include "simpletools.h"
#include "xbee.h"

enum {
    BUFFER_SIZE = 200,
};

fdserial* xbee;
char buffer[BUFFER_SIZE];
int buffer_len;

unsigned char mac_addr[6];
unsigned char ip4_addr[4];
unsigned char ip4_port[2];

static const unsigned char server_addr[4] = {52, 73, 65, 98}; // netsblox.org
//static const unsigned char server_addr[4] = { 129, 59, 104, 208 }; // mmaroti.isis.vanderbilt.edu
static const unsigned char server_port[2] = { 0x07, 0xb5 }; // 1973

void buffer_print(int len)
{
    print("buffer %d:", len);
    if (len > BUFFER_SIZE)
        len = BUFFER_SIZE;
    for (int i = 0; i < len; i++)
        print(" %02x", buffer[i]);
    print("\n");
}

short ntohs(unsigned char* data)
{
    return (data[0] << 8) + data[1];
}

int buffer_cmp(int len, const char* prefix)
{
    if (buffer_len != len)
        return 0;
    for (int i = 0; i < 5; i++) {
        if (prefix[i] != buffer[i])
            return 0;
    }
    return 1;
}

void set_tx_headers(char cmd)
{
    buffer[0] = 0x20;
    buffer[1] = 0x10;
    memcpy(buffer + 2, server_addr, 4);
    memcpy(buffer + 6, server_port, 2);
    memcpy(buffer + 8, ip4_port, 2);
    buffer[10] = 0x00;
    buffer[11] = 0x00;
    memcpy(buffer + 12, mac_addr, 6);
    buffer[18] = cmd;
    buffer_len = 19;
}

int main()
{
    input(9);
    xbee = xbee_open(9, 8, 1);
    xbee_send_api(xbee, "\x8\000IDvummiv", 10);

    xbee_send_api(xbee, "\x8\001SL", 4);
    xbee_send_api(xbee, "\x8\002SH", 4);
    xbee_send_api(xbee, "\x8\003C0", 4);
    xbee_send_api(xbee, "\x8\004MY", 4);

    while (1) {
        buffer_len = xbee_recv_api(xbee, buffer, BUFFER_SIZE, 1000);
        if (buffer_len == -1) {
            xbee_send_api(xbee, "\x8\004MY", 4);
            set_tx_headers('I');
            xbee_send_api(xbee, buffer, buffer_len);
        } else if (buffer_cmp(9, "\x88\001SL")) {
            memcpy(mac_addr + 2, buffer + 5, 4);
        } else if (buffer_cmp(7, "\x88\002SH")) {
            memcpy(mac_addr, buffer + 5, 2);
            print("mac:");
            for (int i = 0; i < 6; i++)
                print(" %02x", mac_addr[i]);
            print("\n");
        } else if (buffer_cmp(7, "\x88\003C0")) {
            memcpy(ip4_port, buffer + 5, 2);
        } else if (buffer_cmp(9, "\x88\004MY")) {
            memcpy(ip4_addr, buffer + 5, 4);
            print("ip4:");
            for (int i = 0; i < 4; i++)
                print("%c%d", i == 0 ? ' ' : '.', ip4_addr[i]);
            print(" %d\n", ntohs(ip4_port));
        } else if (buffer_len >= 0) {
            buffer_print(buffer_len);
        }
    }
}
